import React, { useState, useEffect, useRef } from 'react'
import { MessageCircle, Send, Trash2, User, Paperclip, X, Download } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'

interface Comment {
  id: number
  content: string
  attachments?: string[]
  createdAt: string
  authorName: string
  authorEmail: string
}

interface FileInfo {
  id: string
  name: string
  size: number
}

interface CommentsProps {
  requestId: string
}

const Comments: React.FC<CommentsProps> = ({ requestId }) => {
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [uploadingFiles, setUploadingFiles] = useState(false)
  const [attachments, setAttachments] = useState<FileInfo[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { token } = useAuthStore()

  useEffect(() => {
    if (token) {
      loadComments()
    }
  }, [requestId, token])

  // 获取API基础URL的辅助函数
  const getApiBaseUrl = () => {
    if (import.meta.env.VITE_API_URL) {
      return import.meta.env.VITE_API_URL
    }
    const hostname = window.location.hostname
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:8000'
    }
    return `http://${hostname}:8000`
  }

  const loadComments = async () => {
    setLoading(true)
    try {
      console.log('Comments - Token:', token ? token.substring(0, 20) + '...' : 'null')
      const response = await fetch(`${getApiBaseUrl()}/api/requests/${requestId}/comments`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        console.log('Loaded comments:', data)
        // 确保 attachments 字段被正确解析
        const commentsWithAttachments = data.map((comment: any) => ({
          ...comment,
          attachments: comment.attachments || (Array.isArray(comment.attachments) ? comment.attachments : [])
        }))
        console.log('Comments with attachments:', commentsWithAttachments)
        setComments(commentsWithAttachments)
      } else {
        console.error('Failed to load comments')
      }
    } catch (error) {
      console.error('Error loading comments:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault()
    e.stopPropagation()
    
    const files = e.target.files
    if (!files || files.length === 0) return

    console.log('File selected, uploading files...', files.length)
    setUploadingFiles(true)
    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        const formData = new FormData()
        formData.append('file', file)

        const response = await fetch(`${getApiBaseUrl()}/api/files/upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        })

        if (response.ok) {
          const data = await response.json()
          console.log('File uploaded successfully:', data.fileId)
          return {
            id: data.fileId,
            name: data.filename,
            size: data.size
          }
        } else {
          throw new Error(`Failed to upload ${file.name}`)
        }
      })

      const uploadedFiles = await Promise.all(uploadPromises)
      console.log('All files uploaded, adding to attachments list:', uploadedFiles)
      setAttachments(prev => {
        const updated = [...prev, ...uploadedFiles]
        console.log('Updated attachments list:', updated)
        return updated
      })
    } catch (error) {
      console.error('Error uploading files:', error)
      alert('Failed to upload files. Please try again.')
    } finally {
      setUploadingFiles(false)
      // 重置文件输入
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const removeAttachment = (fileId: string) => {
    setAttachments(prev => prev.filter(f => f.id !== fileId))
  }

  const handleDownloadFile = async (fileId: string) => {
    try {
      console.log('Downloading file:', fileId)
      const response = await fetch(`${getApiBaseUrl()}/api/files/${fileId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        
        // 尝试从响应头获取文件名
        const contentDisposition = response.headers.get('content-disposition')
        let filename = 'download'
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
          if (filenameMatch && filenameMatch[1]) {
            filename = filenameMatch[1].replace(/['"]/g, '')
          }
        }
        
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
        console.log('File downloaded successfully:', filename)
      } else {
        const errorText = await response.text()
        console.error('Failed to download file:', response.status, errorText)
        alert(`Failed to download file: ${response.status === 404 ? 'File not found' : response.status === 403 ? 'Permission denied' : 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error downloading file:', error)
      alert('Error downloading file. Please try again.')
    }
  }

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim() && attachments.length === 0) {
      console.log('No content or attachments, skipping comment creation')
      return
    }

    console.log('Submitting comment with:', {
      content: newComment,
      attachments: attachments.map(f => f.id),
      attachmentsCount: attachments.length
    })

    setSubmitting(true)
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/requests/${requestId}/comments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          content: newComment || '',  // 允许空内容，只要有附件
          attachments: attachments.map(f => f.id)
        })
      })

      if (response.ok) {
        console.log('Comment created successfully')
        setNewComment('')
        setAttachments([])
        loadComments() // 重新加载评论
      } else {
        const errorText = await response.text()
        console.error('Failed to create comment:', response.status, errorText)
        alert('Failed to create comment. Please try again.')
      }
    } catch (error) {
      console.error('Error creating comment:', error)
      alert('Error creating comment. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteComment = async (commentId: number) => {
    if (!confirm('Are you sure you want to delete this comment?')) return

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/requests/${requestId}/comments/${commentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        loadComments() // 重新加载评论
      } else {
        console.error('Failed to delete comment')
      }
    } catch (error) {
      console.error('Error deleting comment:', error)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      padding: '20px'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        marginBottom: '20px',
        paddingBottom: '12px',
        borderBottom: '1px solid #e5e7eb'
      }}>
        <MessageCircle size={20} style={{ marginRight: '8px', color: '#6b7280' }} />
        <h3 style={{
          fontSize: '18px',
          fontWeight: '600',
          color: '#1f2937',
          margin: 0
        }}>
          Comments ({comments.length})
        </h3>
      </div>

      {/* 评论列表 */}
      <div style={{ marginBottom: '20px' }}>
        {loading ? (
          <div style={{
            textAlign: 'center',
            padding: '20px',
            color: '#6b7280'
          }}>
            Loading comments...
          </div>
        ) : comments.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '20px',
            color: '#6b7280',
            fontStyle: 'italic'
          }}>
            No comments yet. Be the first to comment!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {comments.map((comment) => (
              <div
                key={comment.id}
                style={{
                  background: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  padding: '12px'
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '8px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: '#e5e7eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: '8px'
                    }}>
                      <User size={16} color="#6b7280" />
                    </div>
                    <div>
                      <div style={{
                        fontSize: '14px',
                        fontWeight: '500',
                        color: '#1f2937'
                      }}>
                        {comment.authorEmail || comment.authorName}
                      </div>
                      <div style={{
                        fontSize: '12px',
                        color: '#6b7280'
                      }}>
                        {formatDate(comment.createdAt)}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteComment(comment.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#dc2626',
                      cursor: 'pointer',
                      padding: '4px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#fef2f2'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'none'
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div style={{
                  fontSize: '14px',
                  color: '#374151',
                  lineHeight: '1.5',
                  whiteSpace: 'pre-wrap',
                  marginBottom: comment.attachments && comment.attachments.length > 0 ? '8px' : '0'
                }}>
                  {comment.content}
                </div>
                {comment.attachments && Array.isArray(comment.attachments) && comment.attachments.length > 0 && (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    marginTop: '8px',
                    paddingTop: '8px',
                    borderTop: '1px solid #e5e7eb'
                  }}>
                    {comment.attachments.map((fileId: string, index: number) => (
                      <div
                        key={`${comment.id}-${fileId}-${index}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '6px 8px',
                          background: '#f3f4f6',
                          borderRadius: '4px',
                          fontSize: '12px'
                        }}
                      >
                        <Paperclip size={14} color="#6b7280" />
                        <span style={{ flex: 1, color: '#374151' }}>
                          Attachment {index + 1} (ID: {fileId.substring(0, 8)}...)
                        </span>
                        <button
                          onClick={() => handleDownloadFile(fileId)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#3b82f6',
                            cursor: 'pointer',
                            padding: '4px 8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            borderRadius: '4px',
                            transition: 'background-color 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#e0e7ff'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'none'
                          }}
                        >
                          <Download size={14} />
                          Download
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 添加评论表单 */}
      <form onSubmit={(e) => {
        // 添加日志，确保只有在用户明确点击提交时才创建评论
        console.log('Form submit triggered, checking if should create comment...')
        console.log('Current state:', {
          newComment: newComment,
          attachmentsCount: attachments.length,
          submitting: submitting
        })
        handleSubmitComment(e)
      }} style={{
        borderTop: '1px solid #e5e7eb',
        paddingTop: '16px'
      }}
      onKeyDown={(e) => {
        // 防止在文本框中按Enter时意外提交表单
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          // Ctrl+Enter 或 Cmd+Enter 提交评论
          return
        } else if (e.key === 'Enter' && !e.shiftKey) {
          // 单独按Enter不提交，允许换行
          // 但如果在textarea中，Enter应该换行
          if ((e.target as HTMLElement).tagName === 'TEXTAREA') {
            return // 允许换行
          }
          e.preventDefault()
        }
      }}
      >
        <div style={{ marginBottom: '12px' }}>
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            rows={3}
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              outline: 'none',
              resize: 'vertical',
              fontFamily: 'inherit',
              transition: 'border-color 0.2s'
            }}
            onFocus={(e) => {
              e.target.style.borderColor = '#3b82f6'
            }}
            onBlur={(e) => {
              e.target.style.borderColor = '#d1d5db'
            }}
          />
        </div>
        
        {/* 文件上传区域 */}
        <div style={{ marginBottom: '12px' }}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            onClick={(e) => {
              // 阻止事件冒泡，防止触发表单提交
              e.stopPropagation()
            }}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              fileInputRef.current?.click()
            }}
            disabled={uploadingFiles}
            style={{
              background: uploadingFiles ? '#9ca3af' : '#f3f4f6',
              color: uploadingFiles ? '#ffffff' : '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: '500',
              cursor: uploadingFiles ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (!uploadingFiles) {
                e.currentTarget.style.background = '#e5e7eb'
              }
            }}
            onMouseLeave={(e) => {
              if (!uploadingFiles) {
                e.currentTarget.style.background = '#f3f4f6'
              }
            }}
          >
            <Paperclip size={14} />
            {uploadingFiles ? 'Uploading...' : 'Attach Files'}
          </button>
        </div>

        {/* 已上传文件列表 */}
        {attachments.length > 0 && (
          <div style={{
            marginBottom: '12px',
            padding: '8px',
            background: '#f9fafb',
            borderRadius: '6px',
            border: '1px solid #e5e7eb'
          }}>
            {attachments.map((file) => (
              <div
                key={file.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 0',
                  fontSize: '12px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                  <Paperclip size={12} color="#6b7280" />
                  <span style={{ color: '#374151' }}>{file.name}</span>
                  <span style={{ color: '#9ca3af' }}>
                    ({(file.size / 1024).toFixed(1)} KB)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeAttachment(file.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#dc2626',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <button
            type="submit"
            disabled={(!newComment.trim() && attachments.length === 0) || submitting || uploadingFiles}
            style={{
              background: (submitting || uploadingFiles) ? '#9ca3af' : '#3b82f6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: (submitting || uploadingFiles) ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'background-color 0.2s'
            }}
          >
            <Send size={16} />
            {submitting ? 'Posting...' : 'Post Comment'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default Comments
