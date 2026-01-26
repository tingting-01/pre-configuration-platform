"""
DynamoDB 客户端封装
支持自动凭证链：优先使用环境变量，其次使用 AWS 配置文件
"""
import boto3
from botocore.exceptions import ClientError
from typing import Dict, List, Optional, Any
import json
import os
from decimal import Decimal
from datetime import datetime
from dotenv import load_dotenv

# 加载 .env 文件（如果存在）
load_dotenv()

# DynamoDB 客户端配置
# boto3 会自动按优先级查找凭证：
# 1. 环境变量 (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
# 2. AWS 配置文件 (~/.aws/credentials)
# 3. IAM 角色（如果在 AWS 服务内）
dynamodb = boto3.resource(
    'dynamodb',
    region_name=os.getenv('AWS_REGION', 'ap-southeast-2'),
    # 如果环境变量存在，显式传入；否则 boto3 会自动读取配置文件
    **({} if not os.getenv('AWS_ACCESS_KEY_ID') else {
        'aws_access_key_id': os.getenv('AWS_ACCESS_KEY_ID'),
        'aws_secret_access_key': os.getenv('AWS_SECRET_ACCESS_KEY')
    })
)

# 表名常量
TABLES = {
    'users': 'preconfig-users',
    'requests': 'preconfig-requests',
    'templates': 'preconfig-templates',
    'template_usage': 'preconfig-template-usage',
    'template_favorites': 'preconfig-template-favorites',
    'files': 'preconfig-files',
    'comments': 'preconfig-comments',
    'activities': 'preconfig-activities'
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
        """批量通过 id 获取用户（返回 {user_id: user_dict} 字典）"""
        try:
            # 先获取所有用户（如果用户数量不多，这样更高效）
            # 如果用户数量很多，可以考虑使用 BatchGetItem，但需要先知道 email
            all_users = self.get_all_users()
            user_dict = {}
            for user in all_users:
                user_id = user.get('id')
                if user_id in user_ids:
                    user_dict[user_id] = user
            return user_dict
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
    
    def update_request(self, request_id: str, update_data: dict, remove_fields: list = None) -> bool:
        """更新请求"""
        try:
            # 构建更新表达式
            set_expr_parts = []
            remove_expr_parts = []
            expr_attr_names = {}
            expr_attr_values = {}
            
            # 处理 SET 操作
            for key, value in update_data.items():
                attr_name = f"#{key}"
                attr_value = f":{key}"
                set_expr_parts.append(f"{attr_name} = {attr_value}")
                expr_attr_names[attr_name] = key
                # 处理 JSON 字段
                if key in ['config_data', 'changes', 'original_config', 'tags']:
                    value = json.dumps(value) if not isinstance(value, str) else value
                expr_attr_values[attr_value] = convert_to_dynamodb_item({key: value})[key]
            
            # 处理 REMOVE 操作
            if remove_fields:
                for field in remove_fields:
                    attr_name = f"#{field}"
                    remove_expr_parts.append(attr_name)
                    expr_attr_names[attr_name] = field
            
            # 构建完整的更新表达式
            update_expr_parts = []
            if set_expr_parts:
                update_expr_parts.append(f"SET {', '.join(set_expr_parts)}")
            if remove_expr_parts:
                update_expr_parts.append(f"REMOVE {', '.join(remove_expr_parts)}")
            
            if not update_expr_parts:
                return False
            
            update_expr = " ".join(update_expr_parts)
            
            # 构建update_item参数
            update_params = {
                'Key': {'request_id': request_id},
                'UpdateExpression': update_expr
            }
            
            if expr_attr_names:
                update_params['ExpressionAttributeNames'] = expr_attr_names
            if expr_attr_values:
                update_params['ExpressionAttributeValues'] = expr_attr_values
            
            self.tables['requests'].update_item(**update_params)
            return True
        except ClientError as e:
            print(f"Error updating request: {e}")
            return False
    
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

