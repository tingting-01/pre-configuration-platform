"""
DynamoDB 客户端封装
支持自动凭证链：优先使用环境变量，其次使用 AWS 配置文件
"""
import boto3
from botocore.exceptions import ClientError
from boto3.dynamodb.types import TypeSerializer
from typing import Dict, List, Optional, Any
import json
import logging
import os
from decimal import Decimal
from datetime import datetime
from dotenv import load_dotenv
from boto3.dynamodb.conditions import Attr
from wisdm_service import (
    WORKFLOW_CREATED,
    WisdmDuplicateSOError,
    WisdmValidationError,
    WisdmVersionConflictError,
    allowed_workflows,
    actor_snapshot,
    build_auto_sync_plan,
    build_wisdm_history_item,
    merge_auto_supplement,
    normalize_associations,
    normalize_jira_keys,
    normalize_so_number,
)

logger = logging.getLogger(__name__)

# 加载 .env 文件（如果存在）
load_dotenv()

# DynamoDB 客户端配置
# boto3 会自动按优先级查找凭证：
# 1. 环境变量 (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
# 2. AWS 配置文件 (~/.aws/credentials)
# 3. IAM 角色（如果在 AWS 服务内）
DYNAMODB_CONNECTION_KWARGS = {
    'region_name': os.getenv('AWS_REGION', 'ap-southeast-2'),
    # 如果环境变量存在，显式传入；否则 boto3 会自动读取配置文件。
    **({} if not os.getenv('AWS_ACCESS_KEY_ID') else {
        'aws_access_key_id': os.getenv('AWS_ACCESS_KEY_ID'),
        'aws_secret_access_key': os.getenv('AWS_SECRET_ACCESS_KEY')
    }),
}

dynamodb = boto3.resource('dynamodb', **DYNAMODB_CONNECTION_KWARGS)
# Resource 的 meta.client 会自动注入高层 AttributeValue 转换；事务使用独立低层客户端，
# 避免与下面显式 TypeSerializer 叠加导致 Key 被二次序列化。
dynamodb_transaction_client = boto3.client('dynamodb', **DYNAMODB_CONNECTION_KWARGS)

# 表名常量
TABLES = {
    'users': 'preconfig-users',
    'requests': 'preconfig-requests',
    'templates': 'preconfig-templates',
    'template_usage': 'preconfig-template-usage',
    'template_favorites': 'preconfig-template-favorites',
    'files': 'preconfig-files',
    'comments': 'preconfig-comments',
    'activities': 'preconfig-activities',
    'wisdm_service_records': 'preconfig-wisdm-service-records',
    'wisdm_service_history': 'preconfig-wisdm-service-history',
}

def convert_decimal_to_number(obj):
    """递归转换 Decimal 类型为 int 或 float"""
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    elif isinstance(obj, dict):
        return {k: convert_decimal_to_number(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_decimal_to_number(item) for item in obj]
    return obj

def convert_to_dynamodb_item(data: dict) -> dict:
    """将 Python dict 转换为 DynamoDB 格式（处理 float/int/JSON）
    注意：GSI 键字段如果是空字符串，需要省略该字段
    """
    def convert_value(value):
        if value is None:
            # None 值跳过（DynamoDB 不支持 None，但可以省略字段）
            return None
        elif isinstance(value, dict):
            # 字典直接转换为 DynamoDB Map 类型
            return {k: convert_value(v) for k, v in value.items() if v is not None}
        elif isinstance(value, list):
            # 列表转换为 DynamoDB List 类型
            return [convert_value(item) for item in value if item is not None]
        elif isinstance(value, float):
            return Decimal(str(value))
        elif isinstance(value, int):
            return value
        elif isinstance(value, bool):
            return value
        elif isinstance(value, str):
            # 空字符串保留（DynamoDB 支持，但 GSI 键不能是空字符串）
            return value
        else:
            # 其他类型转换为字符串
            return str(value)
    
    # 过滤掉 None 值和空字符串的 GSI 键字段
    # GSI 键字段列表（这些字段如果是空字符串，需要省略）
    gsi_key_fields = ['assignee']  # 可以根据需要添加其他 GSI 键字段
    
    result = {}
    for k, v in data.items():
        # 如果是 GSI 键字段且值为空字符串，跳过
        if k in gsi_key_fields and v == '':
            continue
        converted = convert_value(v)
        if converted is not None:
            result[k] = converted
    return result

def convert_from_dynamodb_item(item: dict) -> dict:
    """将 DynamoDB 格式转换为 Python dict（处理 Decimal 和 JSON 字符串）"""
    if not item:
        return {}
    
    result = convert_decimal_to_number(item)
    
    # 处理 JSON 字符串字段（config_data, changes, original_config, tags, variables 等）
    json_fields = ['config_data', 'changes', 'original_config', 'tags', 'variables', 'variables_used', 'attachments']
    for field in json_fields:
        if field in result and isinstance(result[field], str):
            try:
                result[field] = json.loads(result[field])
            except (json.JSONDecodeError, TypeError):
                pass
    
    return result


class DynamoDBClient:
    """DynamoDB 客户端封装类"""
    
    def __init__(self):
        self.dynamodb = dynamodb
        self.transaction_client = dynamodb_transaction_client
        self.tables = {name: dynamodb.Table(table_name) for name, table_name in TABLES.items()}
    
    # ==================== Users 操作方法 ====================
    
    def get_user_by_email(self, email: str) -> Optional[dict]:
        """通过 email 获取用户"""
        try:
            response = self.tables['users'].get_item(Key={'email': email})
            return convert_from_dynamodb_item(response.get('Item'))
        except ClientError as e:
            print(f"Error getting user by email: {e}")
            return None
    
    def get_user_by_id(self, user_id: int) -> Optional[dict]:
        """通过 id 获取用户（需要扫描，效率较低，建议使用 email）"""
        try:
            response = self.tables['users'].scan(
                FilterExpression='id = :uid',
                ExpressionAttributeValues={':uid': user_id}
            )
            items = response.get('Items', [])
            if items:
                return convert_from_dynamodb_item(items[0])
            return None
        except ClientError as e:
            print(f"Error getting user by id: {e}")
            return None
    
    def create_user(self, user_data: dict) -> bool:
        """创建用户"""
        try:
            item = convert_to_dynamodb_item(user_data)
            self.tables['users'].put_item(Item=item)
            return True
        except ClientError as e:
            print(f"Error creating user: {e}")
            return False
    
    def update_user(self, email: str, update_data: dict) -> bool:
        """更新用户"""
        try:
            # 构建更新表达式
            update_expr = "SET "
            expr_attr_names = {}
            expr_attr_values = {}
            
            for key, value in update_data.items():
                attr_name = f"#{key}"
                attr_value = f":{key}"
                update_expr += f"{attr_name} = {attr_value}, "
                expr_attr_names[attr_name] = key
                expr_attr_values[attr_value] = convert_to_dynamodb_item({key: value})[key]
            
            update_expr = update_expr.rstrip(", ")
            
            self.tables['users'].update_item(
                Key={'email': email},
                UpdateExpression=update_expr,
                ExpressionAttributeNames=expr_attr_names,
                ExpressionAttributeValues=expr_attr_values
            )
            return True
        except ClientError as e:
            print(f"Error updating user: {e}")
            return False
    
    def get_all_users(self) -> List[dict]:
        """获取所有用户（带分页处理）"""
        try:
            items = []
            response = self.tables['users'].scan()
            items.extend([convert_from_dynamodb_item(item) for item in response.get('Items', [])])
            
            # 处理分页
            while 'LastEvaluatedKey' in response:
                response = self.tables['users'].scan(
                    ExclusiveStartKey=response['LastEvaluatedKey']
                )
                items.extend([convert_from_dynamodb_item(item) for item in response.get('Items', [])])
            
            return items
        except ClientError as e:
            print(f"Error getting all users: {e}")
            return []
    
    def get_users_by_ids(self, user_ids: List[int]) -> dict:
        """批量通过 id 获取用户（返回 {user_id: user_dict} 字典）。
        users 表主键为 email，无 user_id GSI：使用单次 Scan + 最小投影 + FilterExpression（或内存过滤），
        避免每次拉全表全字段。
        """
        try:
            uid_set = {int(x) for x in user_ids if x is not None}
            if not uid_set:
                return {}

            proj_names = {'#i': 'id', '#e': 'email', '#n': 'name'}
            proj_expr = '#i, #e, #n'
            base_kw: dict = {
                'ProjectionExpression': proj_expr,
                'ExpressionAttributeNames': proj_names,
            }
            # IN 过长时拆成 OR 链，仍保持单次 Scan（避免多次全表 Scan）
            uid_list = list(uid_set)
            chunk_size = 90
            if len(uid_list) <= chunk_size:
                base_kw['FilterExpression'] = Attr('id').is_in(uid_list)
            else:
                parts = []
                for i in range(0, len(uid_list), chunk_size):
                    chunk = uid_list[i : i + chunk_size]
                    parts.append(Attr('id').is_in(chunk))
                combined = parts[0]
                for p in parts[1:]:
                    combined = combined | p
                base_kw['FilterExpression'] = combined

            result: dict = {}
            response = self.tables['users'].scan(**base_kw)
            for item in response.get('Items', []):
                u = convert_from_dynamodb_item(item)
                uid = u.get('id')
                if uid is not None and uid in uid_set:
                    result[uid] = u
            while 'LastEvaluatedKey' in response:
                response = self.tables['users'].scan(
                    ExclusiveStartKey=response['LastEvaluatedKey'], **base_kw
                )
                for item in response.get('Items', []):
                    u = convert_from_dynamodb_item(item)
                    uid = u.get('id')
                    if uid is not None and uid in uid_set:
                        result[uid] = u
            return result
        except Exception as e:
            print(f"Error getting users by ids: {e}")
            return {}
    
    # ==================== Requests 操作方法 ====================
    
    def get_request(self, request_id: str) -> Optional[dict]:
        """获取请求"""
        try:
            response = self.tables['requests'].get_item(Key={'request_id': request_id})
            return convert_from_dynamodb_item(response.get('Item'))
        except ClientError as e:
            print(f"Error getting request: {e}")
            return None
    
    def create_request(self, request_data: dict) -> bool:
        """创建请求"""
        try:
            item = convert_to_dynamodb_item(request_data)
            print(f"DEBUG: Creating request item: {json.dumps(item, default=str)[:500]}")
            self.tables['requests'].put_item(Item=item)
            print(f"DEBUG: Request created successfully")
            return True
        except ClientError as e:
            print(f"Error creating request: {e}")
            print(f"Error code: {e.response.get('Error', {}).get('Code', 'Unknown')}")
            print(f"Error message: {e.response.get('Error', {}).get('Message', 'Unknown')}")
            import traceback
            traceback.print_exc()
            return False
        except Exception as e:
            print(f"Unexpected error creating request: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def _build_request_update_params(
        self,
        request_id: str,
        update_data: dict,
        remove_fields: list = None,
    ) -> Optional[dict]:
        """构建资源 API 与事务 API 共用的 Request 更新表达式。"""
        set_expr_parts = []
        remove_expr_parts = []
        expr_attr_names = {}
        expr_attr_values = {}

        for key, value in update_data.items():
            attr_name = f"#{key}"
            attr_value = f":{key}"
            set_expr_parts.append(f"{attr_name} = {attr_value}")
            expr_attr_names[attr_name] = key
            if key in ['config_data', 'changes', 'original_config', 'tags']:
                value = json.dumps(value) if not isinstance(value, str) else value
            expr_attr_values[attr_value] = convert_to_dynamodb_item({key: value})[key]

        if remove_fields:
            for field in remove_fields:
                attr_name = f"#{field}"
                remove_expr_parts.append(attr_name)
                expr_attr_names[attr_name] = field

        update_expr_parts = []
        if set_expr_parts:
            update_expr_parts.append(f"SET {', '.join(set_expr_parts)}")
        if remove_expr_parts:
            update_expr_parts.append(f"REMOVE {', '.join(remove_expr_parts)}")
        if not update_expr_parts:
            return None

        update_params = {
            'Key': {'request_id': request_id},
            'UpdateExpression': " ".join(update_expr_parts),
        }
        if expr_attr_names:
            update_params['ExpressionAttributeNames'] = expr_attr_names
        if expr_attr_values:
            update_params['ExpressionAttributeValues'] = expr_attr_values
        return update_params

    def update_request(self, request_id: str, update_data: dict, remove_fields: list = None) -> bool:
        """更新请求。"""
        try:
            update_params = self._build_request_update_params(request_id, update_data, remove_fields)
            if not update_params:
                return False
            self.tables['requests'].update_item(**update_params)
            return True
        except ClientError as e:
            print(f"Error updating request: {e}")
            return False

    def update_request_with_activity(
        self,
        request_id: str,
        update_data: dict,
        activity_data: dict,
        remove_fields: list = None,
    ) -> bool:
        """使用 DynamoDB 事务原子更新 Request 并创建一条 Activity。"""
        try:
            update_params = self._build_request_update_params(
                request_id,
                update_data,
                remove_fields,
            )
            if not update_params:
                return False
            serializer = TypeSerializer()
            activity_item = convert_to_dynamodb_item(activity_data)
            transaction_update = {
                'TableName': TABLES['requests'],
                'Key': {
                    key: serializer.serialize(value)
                    for key, value in update_params['Key'].items()
                },
                'UpdateExpression': update_params['UpdateExpression'],
                'ExpressionAttributeNames': update_params['ExpressionAttributeNames'],
                'ExpressionAttributeValues': {
                    key: serializer.serialize(value)
                    for key, value in update_params['ExpressionAttributeValues'].items()
                },
            }
            self.transaction_client.transact_write_items(
                TransactItems=[
                    {'Update': transaction_update},
                    {
                        'Put': {
                            'TableName': TABLES['activities'],
                            'Item': {
                                key: serializer.serialize(value)
                                for key, value in activity_item.items()
                            },
                        }
                    },
                ]
            )
            return True
        except ClientError as e:
            error = e.response.get('Error', {})
            cancellation_reasons = [
                {
                    'index': index,
                    'operation': 'UpdateRequest' if index == 0 else 'PutActivity',
                    'code': reason.get('Code'),
                    'message': reason.get('Message'),
                }
                for index, reason in enumerate(e.response.get('CancellationReasons') or [])
                if isinstance(reason, dict)
            ]
            logger.error(
                "DynamoDB transaction failed: request_id=%s, operations=%s, "
                "error_code=%s, error_message=%s, cancellation_reasons=%s, aws_request_id=%s",
                request_id,
                f"Update:{TABLES['requests']},Put:{TABLES['activities']}",
                error.get('Code', 'Unknown'),
                error.get('Message', str(e)),
                cancellation_reasons,
                e.response.get('ResponseMetadata', {}).get('RequestId'),
            )
            return False

    def _build_request_put_transact_item(self, request_data: dict) -> dict:
        return {
            'Put': {
                'TableName': TABLES['requests'],
                'Item': self._serialize_transaction_item(request_data),
                'ConditionExpression': 'attribute_not_exists(request_id)',
            }
        }

    def _build_request_update_transact_item(
        self,
        request_id: str,
        update_data: dict,
        remove_fields: list = None,
    ) -> dict:
        params = self._build_request_update_params(
            request_id,
            update_data,
            remove_fields,
        )
        if not params:
            raise WisdmValidationError('No request fields to update')
        serializer = TypeSerializer()
        update = {
            'TableName': TABLES['requests'],
            'Key': {
                key: serializer.serialize(value)
                for key, value in params['Key'].items()
            },
            'UpdateExpression': params['UpdateExpression'],
            'ExpressionAttributeNames': params.get('ExpressionAttributeNames', {}),
        }
        if params.get('ExpressionAttributeValues'):
            update['ExpressionAttributeValues'] = {
                key: serializer.serialize(value)
                for key, value in params['ExpressionAttributeValues'].items()
            }
        return {'Update': update}

    def _build_activity_put_transact_item(self, activity_data: dict) -> dict:
        return {
            'Put': {
                'TableName': TABLES['activities'],
                'Item': self._serialize_transaction_item(activity_data),
            }
        }

    def _write_request_with_wisdm_sync(
        self,
        request_write_item: dict,
        effective_request: dict,
        actor: dict,
        activity_data: Optional[dict] = None,
        max_attempts: int = 3,
    ) -> bool:
        """把请求保存、配置 Activity 与 WisDM 补充放入同一事务。"""

        sync_plan = build_auto_sync_plan(effective_request)
        if not sync_plan:
            raise WisdmValidationError('This request does not qualify for WisDM auto-supplement')

        last_error: Optional[ClientError] = None
        for attempt in range(max_attempts):
            base_items = [request_write_item]
            if activity_data:
                base_items.append(self._build_activity_put_transact_item(activity_data))

            existing = self.get_wisdm_service_record_by_so(sync_plan['so_number'])
            if existing:
                merged, changed = merge_auto_supplement(
                    existing,
                    sync_plan['associations'],
                    whitelist_required=sync_plan['whitelist_required'],
                    provisioning_required=sync_plan['provisioning_required'],
                    company_name=sync_plan['company_name'],
                )
                if changed:
                    update_data = {
                        key: merged.get(key)
                        for key in (
                            'associations',
                            'whitelist_required',
                            'provisioning_required',
                            'company_name',
                        )
                        if merged.get(key) != existing.get(key)
                    }
                    update_data.update({
                        'updated_by': actor_snapshot(actor),
                        'updated_at': datetime.now().isoformat(),
                    })
                    base_items.append(self.build_wisdm_update_transact_item(
                        existing['record_id'],
                        update_data,
                        int(existing.get('version', 1)),
                    ))
            else:
                now = datetime.now().isoformat()
                record_id = self.next_wisdm_service_record_id()
                record_data = {
                    **sync_plan,
                    'workflow': WORKFLOW_CREATED,
                    'jira_keys': [],
                    'notes': '',
                    'source_type': 'automatic',
                    'created_by': actor_snapshot(actor),
                    'updated_by': actor_snapshot(actor),
                    'created_at': now,
                    'updated_at': now,
                }
                history = build_wisdm_history_item(
                    record_id,
                    'created',
                    actor,
                    source_type='automatic',
                    new_workflow=WORKFLOW_CREATED,
                    reason='Created from preconfiguration request save',
                    created_at=now,
                )
                create_items, _record = self.build_wisdm_create_transact_items(
                    record_data,
                    record_id,
                    history,
                )
                base_items.extend(create_items)

            try:
                self.transaction_client.transact_write_items(
                    TransactItems=base_items,
                )
                return True
            except ClientError as error:
                last_error = error
                error_code = error.response.get('Error', {}).get('Code')
                conditional_conflict = any(
                    isinstance(reason, dict)
                    and reason.get('Code') == 'ConditionalCheckFailed'
                    for reason in error.response.get('CancellationReasons') or []
                )
                if (
                    error_code in {
                        'ConditionalCheckFailedException',
                        'TransactionCanceledException',
                    }
                    and (conditional_conflict or not error.response.get('CancellationReasons'))
                    and attempt + 1 < max_attempts
                ):
                    continue
                break

        raise WisdmVersionConflictError(
            'The WisDM service record changed while saving the preconfiguration request'
        ) from last_error

    def create_request_with_wisdm_sync(
        self,
        request_data: dict,
        actor: dict,
        activity_data: Optional[dict] = None,
    ) -> bool:
        return self._write_request_with_wisdm_sync(
            self._build_request_put_transact_item(request_data),
            request_data,
            actor,
            activity_data,
        )

    def update_request_with_wisdm_sync(
        self,
        request_id: str,
        update_data: dict,
        effective_request: dict,
        actor: dict,
        activity_data: Optional[dict] = None,
        remove_fields: list = None,
    ) -> bool:
        return self._write_request_with_wisdm_sync(
            self._build_request_update_transact_item(
                request_id,
                update_data,
                remove_fields,
            ),
            effective_request,
            actor,
            activity_data,
        )
    
    def delete_request(self, request_id: str) -> bool:
        """删除请求"""
        try:
            self.tables['requests'].delete_item(Key={'request_id': request_id})
            return True
        except ClientError as e:
            print(f"Error deleting request: {e}")
            return False
    
    def query_requests_by_user(self, user_id: int) -> List[dict]:
        """通过 user_id 查询请求（使用 GSI）"""
        try:
            response = self.tables['requests'].query(
                IndexName='user_id-index',
                KeyConditionExpression='user_id = :uid',
                ExpressionAttributeValues={':uid': user_id},
                ScanIndexForward=False  # 按 created_at 降序
            )
            return [convert_from_dynamodb_item(item) for item in response.get('Items', [])]
        except ClientError as e:
            print(f"Error querying requests by user: {e}")
            return []

    def query_request_ids_by_user(self, user_id: int) -> List[str]:
        """查询用户创建的请求 ID，避免读取通知接口不需要的完整请求内容。"""
        try:
            response = self.tables['requests'].query(
                IndexName='user_id-index',
                KeyConditionExpression='user_id = :uid',
                ExpressionAttributeValues={':uid': user_id},
                ProjectionExpression='#rid',
                ExpressionAttributeNames={'#rid': 'request_id'},
                ScanIndexForward=False
            )
            return [
                item['request_id']
                for item in response.get('Items', [])
                if item.get('request_id')
            ]
        except ClientError as e:
            print(f"Error querying request ids by user: {e}")
            return []
    
    def query_requests_by_status(self, status: str) -> List[dict]:
        """通过 status 查询请求（使用 GSI）"""
        try:
            response = self.tables['requests'].query(
                IndexName='status-index',
                KeyConditionExpression='#status = :status',
                ExpressionAttributeNames={'#status': 'status'},
                ExpressionAttributeValues={':status': status},
                ScanIndexForward=False
            )
            return [convert_from_dynamodb_item(item) for item in response.get('Items', [])]
        except ClientError as e:
            print(f"Error querying requests by status: {e}")
            return []
    
    def query_requests_by_assignee(self, assignee: str) -> List[dict]:
        """通过 assignee 查询请求（使用 GSI）"""
        try:
            response = self.tables['requests'].query(
                IndexName='assignee-index',
                KeyConditionExpression='assignee = :assignee',
                ExpressionAttributeValues={':assignee': assignee},
                ScanIndexForward=False
            )
            return [convert_from_dynamodb_item(item) for item in response.get('Items', [])]
        except ClientError as e:
            print(f"Error querying requests by assignee: {e}")
            return []

    def query_request_ids_by_assignee(self, assignee: str) -> List[str]:
        """查询当前分配给用户的请求 ID，避免读取完整请求内容。"""
        try:
            response = self.tables['requests'].query(
                IndexName='assignee-index',
                KeyConditionExpression='assignee = :assignee',
                ExpressionAttributeValues={':assignee': assignee},
                ProjectionExpression='#rid',
                ExpressionAttributeNames={'#rid': 'request_id'},
                ScanIndexForward=False
            )
            return [
                item['request_id']
                for item in response.get('Items', [])
                if item.get('request_id')
            ]
        except ClientError as e:
            print(f"Error querying request ids by assignee: {e}")
            return []
    
    def scan_all_requests(self) -> List[dict]:
        """扫描所有请求（用于管理员查看所有请求）"""
        try:
            items = []
            response = self.tables['requests'].scan()
            items.extend(response.get('Items', []))
            
            # 处理分页
            while 'LastEvaluatedKey' in response:
                response = self.tables['requests'].scan(
                    ExclusiveStartKey=response['LastEvaluatedKey']
                )
                items.extend(response.get('Items', []))
            
            return [convert_from_dynamodb_item(item) for item in items]
        except ClientError as e:
            print(f"Error scanning all requests: {e}")
            return []

    def _requests_list_projection_kwargs(self) -> dict:
        """列表接口投影：拉取完整 config_data（兼容 Map / JSON 字符串），仍不读 changes、original_config 等大字段。"""
        return {
            'ProjectionExpression': (
                '#rid, #uid, #cn, #rk, #cfgid, #stt, #st, #as, #tg, #cd'
            ),
            'ExpressionAttributeNames': {
                '#rid': 'request_id',
                '#uid': 'user_id',
                '#cn': 'company_name',
                '#rk': 'rak_id',
                '#cfgid': 'config_id',
                '#stt': 'submit_time',
                '#st': 'status',
                '#as': 'assignee',
                '#tg': 'tags',
                '#cd': 'config_data',
            },
        }

    def scan_requests_for_list(self) -> List[dict]:
        """全表列表用 Scan + 投影；若投影失败（如 config_data 存成字符串）则回退全量 Scan。"""
        proj = self._requests_list_projection_kwargs()
        try:
            items: List[dict] = []
            response = self.tables['requests'].scan(**proj)
            items.extend(response.get('Items', []))
            while 'LastEvaluatedKey' in response:
                response = self.tables['requests'].scan(
                    ExclusiveStartKey=response['LastEvaluatedKey'], **proj
                )
                items.extend(response.get('Items', []))
            return [convert_from_dynamodb_item(item) for item in items]
        except ClientError as e:
            print(f"scan_requests_for_list projection failed, fallback scan_all: {e}")
            return self.scan_all_requests()

    def query_requests_by_user_for_list(self, user_id: int) -> List[dict]:
        """按用户列表 Query + 投影；失败则回退为 query_requests_by_user。"""
        proj = self._requests_list_projection_kwargs()
        qbase = {
            'IndexName': 'user_id-index',
            'KeyConditionExpression': 'user_id = :uid',
            'ExpressionAttributeValues': {':uid': user_id},
            'ScanIndexForward': False,
            **proj,
        }
        try:
            items: List[dict] = []
            response = self.tables['requests'].query(**qbase)
            items.extend(response.get('Items', []))
            while 'LastEvaluatedKey' in response:
                response = self.tables['requests'].query(
                    ExclusiveStartKey=response['LastEvaluatedKey'], **qbase
                )
                items.extend(response.get('Items', []))
            return [convert_from_dynamodb_item(item) for item in items]
        except ClientError as e:
            print(f"query_requests_by_user_for_list projection failed, fallback: {e}")
            return self.query_requests_by_user(user_id)
    
    def batch_delete_requests(self, request_ids: List[str]) -> int:
        """批量删除请求"""
        deleted_count = 0
        try:
            # DynamoDB batch_write_item 最多支持 25 个项目
            for i in range(0, len(request_ids), 25):
                batch = request_ids[i:i+25]
                with self.tables['requests'].batch_writer() as writer:
                    for request_id in batch:
                        writer.delete_item(Key={'request_id': request_id})
                        deleted_count += 1
            return deleted_count
        except ClientError as e:
            print(f"Error batch deleting requests: {e}")
            return deleted_count

    # ==================== WisDM Service 操作方法 ====================

    @staticmethod
    def _serialize_transaction_item(item: dict) -> dict:
        """复用统一转换规则，生成低层事务客户端需要的 AttributeValue。"""

        serializer = TypeSerializer()
        converted = convert_to_dynamodb_item(item)
        return {
            key: serializer.serialize(value)
            for key, value in converted.items()
        }

    def next_wisdm_service_record_id(self) -> str:
        """原子递增计数器并返回至少四位补零的 WDM 编号。"""

        response = self.tables['wisdm_service_records'].update_item(
            Key={'pk': 'COUNTER#WISDM_SERVICE'},
            UpdateExpression='ADD #sequence :increment',
            ExpressionAttributeNames={'#sequence': 'sequence'},
            ExpressionAttributeValues={':increment': 1},
            ReturnValues='UPDATED_NEW',
        )
        sequence = int(response['Attributes']['sequence'])
        return f"WDM{sequence:04d}"

    def build_wisdm_create_transact_items(
        self,
        record_data: dict,
        record_id: str,
        history_item: Optional[dict] = None,
    ) -> tuple[list[dict], dict]:
        """构建服务主记录、SO 唯一占位及可选 History 的事务项。"""

        so_number = str(record_data.get('so_number') or '').strip()
        so_number_key = normalize_so_number(so_number)
        if not so_number_key:
            raise WisdmValidationError('SO Number is required')

        associations = normalize_associations(
            record_data.get('associations', record_data.get('barcodes', []))
        )
        if not associations:
            raise WisdmValidationError('At least one barcode association is required')

        whitelist_required = bool(record_data.get('whitelist_required'))
        provisioning_required = bool(record_data.get('provisioning_required'))
        workflows = allowed_workflows(whitelist_required, provisioning_required)
        if not workflows:
            raise WisdmValidationError('At least one WisDM service is required')
        workflow = record_data.get('workflow') or WORKFLOW_CREATED
        if workflow not in workflows:
            raise WisdmValidationError('Workflow does not match the selected WisDM services')

        record = dict(record_data)
        record.update({
            'pk': f'RECORD#{record_id}',
            'record_id': record_id,
            'so_number': so_number,
            'so_number_key': so_number_key,
            'associations': associations,
            'whitelist_required': whitelist_required,
            'provisioning_required': provisioning_required,
            'jira_keys': (
                normalize_jira_keys(record_data.get('jira_keys'))
                if whitelist_required else []
            ),
            'workflow': workflow,
            'version': 1,
        })
        record.pop('barcodes', None)

        so_lock = {
            'pk': f'SO#{so_number_key}',
            'record_id': record_id,
            'so_number': so_number,
        }
        items = [
            {
                'Put': {
                    'TableName': TABLES['wisdm_service_records'],
                    'Item': self._serialize_transaction_item(record),
                    'ConditionExpression': 'attribute_not_exists(pk)',
                }
            },
            {
                'Put': {
                    'TableName': TABLES['wisdm_service_records'],
                    'Item': self._serialize_transaction_item(so_lock),
                    'ConditionExpression': 'attribute_not_exists(pk)',
                }
            },
        ]
        if history_item:
            history = dict(history_item)
            history['record_id'] = record_id
            items.append({
                'Put': {
                    'TableName': TABLES['wisdm_service_history'],
                    'Item': self._serialize_transaction_item(history),
                    'ConditionExpression': (
                        'attribute_not_exists(record_id) AND '
                        'attribute_not_exists(event_key)'
                    ),
                }
            })
        return items, record

    def create_wisdm_service_record(
        self,
        record_data: dict,
        history_item: Optional[dict] = None,
    ) -> dict:
        """分配 WDM 编号并事务创建主记录与 SO 唯一占位。"""

        record_id = self.next_wisdm_service_record_id()
        transact_items, record = self.build_wisdm_create_transact_items(
            record_data,
            record_id,
            history_item,
        )
        try:
            self.transaction_client.transact_write_items(
                TransactItems=transact_items,
            )
        except ClientError as error:
            error_code = error.response.get('Error', {}).get('Code')
            cancellation_reasons = error.response.get('CancellationReasons') or []
            has_condition_conflict = any(
                reason.get('Code') == 'ConditionalCheckFailed'
                for reason in cancellation_reasons[:2]
                if isinstance(reason, dict)
            )
            if error_code in {
                'ConditionalCheckFailedException',
                'TransactionCanceledException',
            } and (has_condition_conflict or not cancellation_reasons):
                raise WisdmDuplicateSOError(
                    f"SO {record['so_number']} already has a service record"
                ) from error
            raise
        return convert_from_dynamodb_item(record)

    def get_wisdm_service_record(self, record_id: str) -> Optional[dict]:
        response = self.tables['wisdm_service_records'].get_item(
            Key={'pk': f"RECORD#{str(record_id).strip().upper()}"}
        )
        item = convert_from_dynamodb_item(response.get('Item'))
        return item or None

    def get_wisdm_service_record_by_so(self, so_number: str) -> Optional[dict]:
        so_number_key = normalize_so_number(so_number)
        if not so_number_key:
            return None
        lock_response = self.tables['wisdm_service_records'].get_item(
            Key={'pk': f'SO#{so_number_key}'}
        )
        lock = convert_from_dynamodb_item(lock_response.get('Item'))
        record_id = lock.get('record_id')
        if not record_id:
            return None
        return self.get_wisdm_service_record(record_id)

    def scan_wisdm_service_records(self) -> List[dict]:
        """扫描服务主记录；计数器和 SO 占位项不会进入结果。"""

        scan_kwargs = {
            'FilterExpression': 'begins_with(#pk, :record_prefix)',
            'ExpressionAttributeNames': {'#pk': 'pk'},
            'ExpressionAttributeValues': {':record_prefix': 'RECORD#'},
        }
        items: List[dict] = []
        response = self.tables['wisdm_service_records'].scan(**scan_kwargs)
        items.extend(response.get('Items', []))
        while 'LastEvaluatedKey' in response:
            response = self.tables['wisdm_service_records'].scan(
                ExclusiveStartKey=response['LastEvaluatedKey'],
                **scan_kwargs,
            )
            items.extend(response.get('Items', []))
        return [
            convert_from_dynamodb_item(item)
            for item in items
            if str(item.get('pk', '')).startswith('RECORD#')
        ]

    def _build_wisdm_record_update_params(
        self,
        record_id: str,
        update_data: dict,
        expected_version: int,
    ) -> dict:
        immutable_fields = {'pk', 'record_id', 'so_number', 'so_number_key', 'version'}
        forbidden = immutable_fields.intersection(update_data)
        if forbidden:
            raise WisdmValidationError(
                f"These fields cannot be changed: {', '.join(sorted(forbidden))}"
            )
        if not update_data:
            raise WisdmValidationError('No fields to update')

        normalized_update = dict(update_data)
        if 'associations' in normalized_update:
            normalized_update['associations'] = normalize_associations(
                normalized_update['associations']
            )
        if 'jira_keys' in normalized_update:
            normalized_update['jira_keys'] = normalize_jira_keys(
                normalized_update['jira_keys']
            )

        names = {
            '#pk': 'pk',
            '#version': 'version',
        }
        values = {
            ':expected_version': int(expected_version),
            ':increment': 1,
        }
        set_parts = ['#version = #version + :increment']
        for index, (field, value) in enumerate(normalized_update.items()):
            name_token = f'#field_{index}'
            value_token = f':value_{index}'
            names[name_token] = field
            values[value_token] = convert_to_dynamodb_item({field: value})[field]
            set_parts.append(f'{name_token} = {value_token}')

        return {
            'Key': {'pk': f"RECORD#{str(record_id).strip().upper()}"},
            'UpdateExpression': f"SET {', '.join(set_parts)}",
            'ConditionExpression': (
                'attribute_exists(#pk) AND #version = :expected_version'
            ),
            'ExpressionAttributeNames': names,
            'ExpressionAttributeValues': values,
        }

    def build_wisdm_update_transact_item(
        self,
        record_id: str,
        update_data: dict,
        expected_version: int,
    ) -> dict:
        """构建可与请求保存、Activity 或 History 组合的低层更新项。"""

        params = self._build_wisdm_record_update_params(
            record_id,
            update_data,
            expected_version,
        )
        serializer = TypeSerializer()
        return {
            'Update': {
                'TableName': TABLES['wisdm_service_records'],
                'Key': {
                    key: serializer.serialize(value)
                    for key, value in params['Key'].items()
                },
                'UpdateExpression': params['UpdateExpression'],
                'ConditionExpression': params['ConditionExpression'],
                'ExpressionAttributeNames': params['ExpressionAttributeNames'],
                'ExpressionAttributeValues': {
                    key: serializer.serialize(value)
                    for key, value in params['ExpressionAttributeValues'].items()
                },
            }
        }

    def update_wisdm_service_record(
        self,
        record_id: str,
        update_data: dict,
        expected_version: int,
    ) -> dict:
        """以版本条件更新记录，冲突时抛出明确异常。"""

        params = self._build_wisdm_record_update_params(
            record_id,
            update_data,
            expected_version,
        )

        try:
            response = self.tables['wisdm_service_records'].update_item(
                **params,
                ReturnValues='ALL_NEW',
            )
        except ClientError as error:
            if error.response.get('Error', {}).get('Code') == (
                'ConditionalCheckFailedException'
            ):
                raise WisdmVersionConflictError(
                    f'Service record {record_id} was updated by another request'
                ) from error
            raise
        return convert_from_dynamodb_item(response.get('Attributes'))

    def update_wisdm_workflow_with_history(
        self,
        record: dict,
        new_workflow: str,
        history_item: dict,
        expected_version: int,
        update_metadata: Optional[dict] = None,
    ) -> dict:
        """在同一事务中更新 Workflow 并写入 History。"""

        update_data = dict(update_metadata or {})
        update_data['workflow'] = new_workflow
        update_item = self.build_wisdm_update_transact_item(
            record['record_id'],
            update_data,
            expected_version,
        )
        history = dict(history_item)
        history['record_id'] = record['record_id']
        history_put = {
            'Put': {
                'TableName': TABLES['wisdm_service_history'],
                'Item': self._serialize_transaction_item(history),
                'ConditionExpression': (
                    'attribute_not_exists(record_id) AND '
                    'attribute_not_exists(event_key)'
                ),
            }
        }
        try:
            self.transaction_client.transact_write_items(
                TransactItems=[update_item, history_put]
            )
        except ClientError as error:
            reasons = error.response.get('CancellationReasons') or []
            update_conflict = bool(
                reasons
                and isinstance(reasons[0], dict)
                and reasons[0].get('Code') == 'ConditionalCheckFailed'
            )
            if (
                error.response.get('Error', {}).get('Code')
                in {'ConditionalCheckFailedException', 'TransactionCanceledException'}
                and (update_conflict or not reasons)
            ):
                raise WisdmVersionConflictError(
                    f"Service record {record['record_id']} was updated by another request"
                ) from error
            raise

        updated = dict(record)
        updated.update(update_data)
        updated['version'] = int(expected_version) + 1
        return updated

    def put_wisdm_service_history(self, history_item: dict) -> None:
        """写入单条 History；事务场景应复用 build 方法中的低层写入。"""

        self.tables['wisdm_service_history'].put_item(
            Item=convert_to_dynamodb_item(history_item),
            ConditionExpression=(
                'attribute_not_exists(record_id) AND attribute_not_exists(event_key)'
            ),
        )

    def query_wisdm_service_history(
        self,
        record_id: str,
        limit: Optional[int] = None,
    ) -> List[dict]:
        """按 event_key 从新到旧查询 History。"""

        query_kwargs = {
            'KeyConditionExpression': '#record_id = :record_id',
            'ExpressionAttributeNames': {'#record_id': 'record_id'},
            'ExpressionAttributeValues': {':record_id': record_id},
            'ScanIndexForward': False,
        }
        if limit is not None:
            query_kwargs['Limit'] = int(limit)

        items: List[dict] = []
        response = self.tables['wisdm_service_history'].query(**query_kwargs)
        items.extend(response.get('Items', []))
        while limit is None and 'LastEvaluatedKey' in response:
            response = self.tables['wisdm_service_history'].query(
                ExclusiveStartKey=response['LastEvaluatedKey'],
                **query_kwargs,
            )
            items.extend(response.get('Items', []))
        converted = [convert_from_dynamodb_item(item) for item in items]
        converted.sort(key=lambda item: item.get('event_key', ''), reverse=True)
        return converted[:limit] if limit is not None else converted

    def _delete_wisdm_service_history(
        self,
        record_id: str,
        *,
        batch_size: int = 25,
        max_batch_attempts: int = 5,
    ) -> None:
        """分页批量删除一条服务记录的全部 History；失败时可由调用方重试。"""

        serializer = TypeSerializer()
        history_table_name = TABLES['wisdm_service_history']
        while True:
            response = self.tables['wisdm_service_history'].query(
                KeyConditionExpression='#record_id = :record_id',
                ExpressionAttributeNames={
                    '#record_id': 'record_id',
                    '#event_key': 'event_key',
                },
                ExpressionAttributeValues={':record_id': record_id},
                ProjectionExpression='#record_id, #event_key',
                ConsistentRead=True,
                Limit=batch_size,
            )
            history_keys = []
            for raw_item in response.get('Items', []):
                item = convert_from_dynamodb_item(raw_item)
                if item.get('record_id') and item.get('event_key'):
                    history_keys.append({
                        'record_id': item['record_id'],
                        'event_key': item['event_key'],
                    })
            if not history_keys:
                return

            pending = {
                history_table_name: [
                    {
                        'DeleteRequest': {
                            'Key': {
                                key: serializer.serialize(value)
                                for key, value in history_key.items()
                            }
                        }
                    }
                    for history_key in history_keys
                ]
            }
            for _attempt in range(max_batch_attempts):
                batch_response = self.transaction_client.batch_write_item(
                    RequestItems=pending,
                )
                unprocessed = batch_response.get('UnprocessedItems') or {}
                pending_items = unprocessed.get(history_table_name) or []
                if not pending_items:
                    break
                pending = {history_table_name: pending_items}
            else:
                raise RuntimeError(
                    f'Failed to delete all History for WisDM service record {record_id}'
                )

    def delete_wisdm_service_record(self, record: dict) -> bool:
        """彻底删除 History、服务主记录和 SO 唯一占位。"""

        record_id = str(record.get('record_id') or '').strip().upper()
        so_number_key = str(
            record.get('so_number_key') or normalize_so_number(record.get('so_number'))
        ).strip()
        if not record_id or not so_number_key:
            raise WisdmValidationError('WisDM service record identity is incomplete')
        try:
            expected_version = int(record.get('version', 1))
        except (TypeError, ValueError) as error:
            raise WisdmValidationError('WisDM service record version is invalid') from error

        self._delete_wisdm_service_history(record_id)

        serializer = TypeSerializer()
        transact_items = [
            {
                'Delete': {
                    'TableName': TABLES['wisdm_service_records'],
                    'Key': {
                        'pk': serializer.serialize(f'RECORD#{record_id}'),
                    },
                    'ConditionExpression': (
                        'attribute_exists(#pk) AND #version = :expected_version'
                    ),
                    'ExpressionAttributeNames': {
                        '#pk': 'pk',
                        '#version': 'version',
                    },
                    'ExpressionAttributeValues': {
                        ':expected_version': serializer.serialize(expected_version),
                    },
                }
            },
            {
                'Delete': {
                    'TableName': TABLES['wisdm_service_records'],
                    'Key': {
                        'pk': serializer.serialize(f'SO#{so_number_key}'),
                    },
                    'ConditionExpression': (
                        'attribute_exists(#pk) AND #record_id = :record_id'
                    ),
                    'ExpressionAttributeNames': {
                        '#pk': 'pk',
                        '#record_id': 'record_id',
                    },
                    'ExpressionAttributeValues': {
                        ':record_id': serializer.serialize(record_id),
                    },
                }
            },
        ]
        try:
            self.transaction_client.transact_write_items(
                TransactItems=transact_items,
            )
        except ClientError as error:
            error_code = error.response.get('Error', {}).get('Code')
            cancellation_reasons = error.response.get('CancellationReasons') or []
            has_condition_conflict = any(
                isinstance(reason, dict)
                and reason.get('Code') == 'ConditionalCheckFailed'
                for reason in cancellation_reasons
            )
            if error_code in {
                'ConditionalCheckFailedException',
                'TransactionCanceledException',
            } and (has_condition_conflict or not cancellation_reasons):
                raise WisdmVersionConflictError(
                    f'Service record {record_id} changed while it was being deleted'
                ) from error
            raise
        return True
    
    # ==================== Templates 操作方法 ====================
    
    def get_template(self, template_id: str) -> Optional[dict]:
        """获取模板"""
        try:
            response = self.tables['templates'].get_item(Key={'template_id': template_id})
            return convert_from_dynamodb_item(response.get('Item'))
        except ClientError as e:
            print(f"Error getting template: {e}")
            return None
    
    def create_template(self, template_data: dict) -> bool:
        """创建模板"""
        try:
            item = convert_to_dynamodb_item(template_data)
            self.tables['templates'].put_item(Item=item)
            return True
        except ClientError as e:
            print(f"Error creating template: {e}")
            return False
    
    def update_template(self, template_id: str, update_data: dict) -> bool:
        """更新模板"""
        try:
            update_expr = "SET "
            expr_attr_names = {}
            expr_attr_values = {}
            
            # 检查是否已经包含 updated_at 和 version
            has_updated_at = 'updated_at' in update_data
            has_version = 'version' in update_data
            
            for key, value in update_data.items():
                attr_name = f"#{key}"
                attr_value = f":{key}"
                update_expr += f"{attr_name} = {attr_value}, "
                expr_attr_names[attr_name] = key
                if key in ['config_data', 'variables', 'tags']:
                    value = json.dumps(value) if not isinstance(value, str) else value
                expr_attr_values[attr_value] = convert_to_dynamodb_item({key: value})[key]
            
            update_expr = update_expr.rstrip(", ")
            
            # 只有在 update_data 中没有这些字段时才自动添加
            if not has_updated_at:
                update_expr += ", updated_at = :updated_at"
                expr_attr_values[':updated_at'] = datetime.now().isoformat()
            
            if not has_version:
                update_expr += ", version = version + :inc"
                expr_attr_values[':inc'] = 1
            
            self.tables['templates'].update_item(
                Key={'template_id': template_id},
                UpdateExpression=update_expr,
                ExpressionAttributeNames=expr_attr_names,
                ExpressionAttributeValues=expr_attr_values
            )
            return True
        except ClientError as e:
            print(f"Error updating template: {e}")
            return False
    
    def delete_template(self, template_id: str) -> bool:
        """删除模板"""
        try:
            self.tables['templates'].delete_item(Key={'template_id': template_id})
            return True
        except ClientError as e:
            print(f"Error deleting template: {e}")
            return False

    # --- Backward-compatible aliases (keep main_simple.py stable) ---
    def scan_templates(self, filter_expression=None) -> List[dict]:
        """兼容旧方法名：扫描模板"""
        return self.scan_all_templates(filter_expression=filter_expression)
    
    def scan_all_templates(self, filter_expression=None) -> List[dict]:
        """扫描所有模板"""
        try:
            items = []
            scan_kwargs = {}
            if filter_expression:
                scan_kwargs['FilterExpression'] = filter_expression
            
            response = self.tables['templates'].scan(**scan_kwargs)
            items.extend(response.get('Items', []))
            
            while 'LastEvaluatedKey' in response:
                scan_kwargs['ExclusiveStartKey'] = response['LastEvaluatedKey']
                response = self.tables['templates'].scan(**scan_kwargs)
                items.extend(response.get('Items', []))
            
            return [convert_from_dynamodb_item(item) for item in items]
        except ClientError as e:
            print(f"Error scanning templates: {e}")
            return []

    def query_templates_by_created_by(self, created_by: int) -> List[dict]:
        """兼容旧方法名：按创建者查询模板"""
        return self.query_templates_by_creator(created_by)
    
    def query_templates_by_creator(self, created_by: int) -> List[dict]:
        """通过创建者查询模板（使用 GSI）"""
        try:
            response = self.tables['templates'].query(
                IndexName='created_by-index',
                KeyConditionExpression='created_by = :uid',
                ExpressionAttributeValues={':uid': created_by},
                ScanIndexForward=False
            )
            return [convert_from_dynamodb_item(item) for item in response.get('Items', [])]
        except ClientError as e:
            print(f"Error querying templates by creator: {e}")
            return []
    
    def query_templates_by_category(self, category: str) -> List[dict]:
        """通过分类查询模板（使用 GSI）"""
        try:
            response = self.tables['templates'].query(
                IndexName='category-index',
                KeyConditionExpression='category = :cat',
                ExpressionAttributeValues={':cat': category},
                ScanIndexForward=False
            )
            return [convert_from_dynamodb_item(item) for item in response.get('Items', [])]
        except ClientError as e:
            print(f"Error querying templates by category: {e}")
            return []
    
    def increment_template_usage(self, template_id: str) -> bool:
        """增加模板使用次数"""
        try:
            self.tables['templates'].update_item(
                Key={'template_id': template_id},
                UpdateExpression='SET usage_count = usage_count + :inc',
                ExpressionAttributeValues={':inc': 1}
            )
            return True
        except ClientError as e:
            print(f"Error incrementing template usage: {e}")
            return False

    def increment_template_usage_count(self, template_id: str) -> bool:
        """兼容旧方法名：增加模板使用次数"""
        return self.increment_template_usage(template_id)
    
    # ==================== Template Usage 操作方法 ====================
    
    def create_template_usage(self, usage_data: dict) -> bool:
        """创建模板使用记录"""
        try:
            item = convert_to_dynamodb_item(usage_data)
            self.tables['template_usage'].put_item(Item=item)
            return True
        except ClientError as e:
            print(f"Error creating template usage: {e}")
            return False
    
    def query_template_usage_by_template(self, template_id: str) -> List[dict]:
        """通过模板ID查询使用记录"""
        try:
            response = self.tables['template_usage'].query(
                KeyConditionExpression='template_id = :tid',
                ExpressionAttributeValues={':tid': template_id},
                ScanIndexForward=False
            )
            return [convert_from_dynamodb_item(item) for item in response.get('Items', [])]
        except ClientError as e:
            print(f"Error querying template usage: {e}")
            return []
    
    def query_template_usage_by_user(self, user_id: int) -> List[dict]:
        """通过用户ID查询使用记录（使用 GSI）"""
        try:
            response = self.tables['template_usage'].query(
                IndexName='used_by-index',
                KeyConditionExpression='used_by = :uid',
                ExpressionAttributeValues={':uid': user_id},
                ScanIndexForward=False
            )
            return [convert_from_dynamodb_item(item) for item in response.get('Items', [])]
        except ClientError as e:
            print(f"Error querying template usage by user: {e}")
            return []
    
    # ==================== Template Favorites 操作方法 ====================
    
    def add_template_favorite(self, user_id: int, template_id: str) -> bool:
        """添加模板收藏"""
        try:
            self.tables['template_favorites'].put_item(
                Item={
                    'user_id': user_id,
                    'template_id': template_id,
                    'created_at': datetime.now().isoformat()
                }
            )
            return True
        except ClientError as e:
            print(f"Error adding template favorite: {e}")
            return False
    
    def remove_template_favorite(self, user_id: int, template_id: str) -> bool:
        """移除模板收藏"""
        try:
            self.tables['template_favorites'].delete_item(
                Key={
                    'user_id': user_id,
                    'template_id': template_id
                }
            )
            return True
        except ClientError as e:
            print(f"Error removing template favorite: {e}")
            return False
    
    def get_user_favorites(self, user_id: int) -> List[str]:
        """获取用户收藏的模板ID列表"""
        try:
            response = self.tables['template_favorites'].query(
                KeyConditionExpression='user_id = :uid',
                ExpressionAttributeValues={':uid': user_id}
            )
            return [item['template_id'] for item in response.get('Items', [])]
        except ClientError as e:
            print(f"Error getting user favorites: {e}")
            return []
    
    # ==================== Files 操作方法 ====================
    
    def create_file(self, file_data: dict) -> bool:
        """创建文件记录"""
        try:
            item = convert_to_dynamodb_item(file_data)
            self.tables['files'].put_item(Item=item)
            return True
        except ClientError as e:
            print(f"Error creating file: {e}")
            return False
    
    def get_file(self, file_id: str) -> Optional[dict]:
        """获取文件记录"""
        try:
            response = self.tables['files'].get_item(Key={'id': file_id})
            return convert_from_dynamodb_item(response.get('Item'))
        except ClientError as e:
            print(f"Error getting file: {e}")
            return None
    
    def query_files_by_user(self, user_id: int) -> List[dict]:
        """通过用户ID查询文件（使用 GSI）"""
        try:
            response = self.tables['files'].query(
                IndexName='user_id-index',
                KeyConditionExpression='user_id = :uid',
                ExpressionAttributeValues={':uid': user_id},
                ScanIndexForward=False
            )
            return [convert_from_dynamodb_item(item) for item in response.get('Items', [])]
        except ClientError as e:
            print(f"Error querying files by user: {e}")
            return []
    
    # ==================== Comments 操作方法 ====================
    
    def create_comment(self, comment_data: dict) -> bool:
        """创建评论"""
        try:
            item = convert_to_dynamodb_item(comment_data)
            self.tables['comments'].put_item(Item=item)
            return True
        except ClientError as e:
            print(f"Error creating comment: {e}")
            return False
    
    def get_comments_by_request(self, request_id: str) -> List[dict]:
        """通过请求ID查询评论"""
        try:
            response = self.tables['comments'].query(
                KeyConditionExpression='request_id = :rid',
                ExpressionAttributeValues={':rid': request_id},
                ScanIndexForward=True  # 按时间升序
            )
            return [convert_from_dynamodb_item(item) for item in response.get('Items', [])]
        except ClientError as e:
            print(f"Error getting comments: {e}")
            return []
    
    def delete_comment(self, request_id: str, created_at: str) -> bool:
        """删除评论（需要 request_id 和 created_at 作为复合主键）"""
        try:
            self.tables['comments'].delete_item(
                Key={
                    'request_id': request_id,
                    'created_at': created_at
                }
            )
            return True
        except ClientError as e:
            print(f"Error deleting comment: {e}")
            return False
    
    # ==================== Activities 操作方法 ====================
    
    def create_activity(self, activity_data: dict) -> bool:
        """创建活动记录"""
        try:
            item = convert_to_dynamodb_item(activity_data)
            self.tables['activities'].put_item(Item=item)
            return True
        except ClientError as e:
            print(f"Error creating activity: {e}")
            return False
    
    def get_activities_by_request(self, request_id: str) -> List[dict]:
        """通过请求ID查询活动"""
        try:
            response = self.tables['activities'].query(
                KeyConditionExpression='request_id = :rid',
                ExpressionAttributeValues={':rid': request_id},
                ScanIndexForward=False  # 按时间降序
            )
            return [convert_from_dynamodb_item(item) for item in response.get('Items', [])]
        except ClientError as e:
            print(f"Error getting activities: {e}")
            return []

    def get_assignment_activities_by_request(
        self,
        request_id: str,
        activity_types: List[str]
    ) -> List[dict]:
        """按请求读取指定类型的通知活动，只返回通知计算所需字段。"""
        try:
            response = self.tables['activities'].query(
                KeyConditionExpression='request_id = :rid',
                ExpressionAttributeValues={':rid': request_id},
                FilterExpression=Attr('activity_type').is_in(activity_types),
                ProjectionExpression=(
                    '#id, #rid, #type, #description, #uid, #created_at'
                ),
                ExpressionAttributeNames={
                    '#id': 'id',
                    '#rid': 'request_id',
                    '#type': 'activity_type',
                    '#description': 'description',
                    '#uid': 'user_id',
                    '#created_at': 'created_at',
                },
                ScanIndexForward=False
            )
            return [
                convert_from_dynamodb_item(item)
                for item in response.get('Items', [])
            ]
        except ClientError as e:
            print(f"Error getting assignment activities: {e}")
            return []
    
    def query_activities_by_user(self, user_id: int, filter_expression=None) -> List[dict]:
        """通过用户ID查询活动（使用 GSI）"""
        try:
            query_kwargs = {
                'IndexName': 'user_id-index',
                'KeyConditionExpression': 'user_id = :uid',
                'ExpressionAttributeValues': {':uid': user_id},
                'ScanIndexForward': False
            }
            if filter_expression:
                query_kwargs['FilterExpression'] = filter_expression
            
            response = self.tables['activities'].query(**query_kwargs)
            return [convert_from_dynamodb_item(item) for item in response.get('Items', [])]
        except ClientError as e:
            print(f"Error querying activities by user: {e}")
            return []


# 创建全局实例
db_client = DynamoDBClient()

