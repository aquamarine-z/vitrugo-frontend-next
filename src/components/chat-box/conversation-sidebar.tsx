import React, { useEffect, useState } from "react";

interface Conversation {
    id: number;
    title: string;
    created_at: string;
    updated_at: string;
}

interface ConversationSidebarProps {
    open: boolean;
    onClose: () => void;
    onSelectConversation?: (data: {title: string, messages: [], id: number}) => void;
}

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({ open, onClose, onSelectConversation }) => {
    const [loading, setLoading] = useState(false);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [error, setError] = useState<string | null>(null);

    // 新增：用于记录哪个会话的菜单被打开
    const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
    // 新增：重命名输入框状态
    const [renameId, setRenameId] = useState<number | null>(null);
    const [renameValue, setRenameValue] = useState('');
    // 新增：新建会话loading
    const [creating, setCreating] = useState(false);

    // 获取后端端口号
    const getBackendPort = () => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('backendPort') || '8081';
        }
        return '8081';
    };

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        setError(null);
        const port = getBackendPort();
        fetch(`http://127.0.0.1:${port}/conversation`, {
            credentials: 'include'
        })
            .then(res => {
                if (res.status === 401) {
                    window.location.href = '/login';
                    return Promise.reject('未登录');
                }
                return res.json();
            })
            .then(data => {
                if (Array.isArray(data.conversations)) {
                    // 按 created_at 升序
                    setConversations((data.conversations as Conversation[]).sort((a: Conversation, b: Conversation) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
                } else {
                    setConversations([]);
                }
            })
            .catch(() => {
                setError('获取会话失败');
                setConversations([]);
            })
            .finally(() => setLoading(false));
    }, [open]);

    // 删除会话
    const handleDelete = async (id: number) => {
        if (!window.confirm('确定要删除该会话吗？')) return;
        try {
            const port = getBackendPort();
            const res = await fetch(`http://127.0.0.1:${port}/conversation/${id}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            if (res.status === 401) {
                window.location.href = '/login';
                return;
            }
            setConversations(conversations.filter(c => c.id !== id));
        } catch (exc) {
            alert('删除失败'+exc);
        }
        setMenuOpenId(null);
    };
    // 重命名会话
    const handleRename = async (id: number) => {
        if (!renameValue.trim()) return;
        try {
            const port = getBackendPort();
            const res = await fetch(`http://127.0.0.1:${port}/conversation/${id}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                credentials: 'include',
                body: JSON.stringify({title: renameValue.trim()})
            });
            if (res.status === 401) {
                window.location.href = '/login';
                return;
            }
            setConversations(conversations.map(c => c.id === id ? {...c, title: renameValue.trim()} : c));
            setRenameId(null);
        } catch (_e) {
            alert('重命名失败');
        }
        setMenuOpenId(null);
    };
    // 新建会话方法
    const handleCreateConversation = async () => {
        setCreating(true);
        try {
            const port = getBackendPort();
            const res = await fetch(`http://127.0.0.1:${port}/conversation`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            if (res.status === 401) {
                window.location.href = '/login';
                return;
            }
            await res.json();
            // 重新拉取会话
            fetch(`http://127.0.0.1:${port}/conversation`, { credentials: 'include' })
                .then(res => res.json())
                .then(data => {
                    if (Array.isArray(data.conversations)) {
                        setConversations((data.conversations as Conversation[]).sort((a: Conversation, b: Conversation) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
                    } else {
                        setConversations([]);
                    }
                });
        } catch (e) {
            alert('新建会话失败');
        } finally {
            setCreating(false);
        }
    };

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                height: '100%',
                width: 320,
                background: 'var(--sidebar, #fff)',
                boxShadow: '2px 0 8px rgba(0,0,0,0.08)',
                zIndex: 3000,
                transform: open ? 'translateX(0)' : 'translateX(-100%)',
                transition: 'transform 0.3s cubic-bezier(.4,0,.2,1)',
                display: 'flex',
                flexDirection: 'column',
            }}
            onClick={e => e.stopPropagation()}
        >
            <div style={{padding: '16px 20px', fontWeight: 600, fontSize: 18, borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                <span>会话列表</span>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <button onClick={handleCreateConversation} disabled={creating} style={{background: '#4caf50', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', marginRight: 8, cursor: creating ? 'not-allowed' : 'pointer', fontSize: 14}} aria-label="新建会话">
                        {creating ? '创建中...' : '+ 新建'}
                    </button>
                    <button onClick={onClose} style={{background: 'none', border: 'none', cursor: 'pointer', padding: 0}} aria-label="关闭">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>
                    </button>
                </div>
            </div>
            <div style={{flex: 1, overflowY: 'auto', padding: 16}}>
                {loading && <div>加载中...</div>}
                {error && <div style={{color: 'red'}}>{error}</div>}
                {!loading && !error && conversations.length === 0 && <div>暂无会话</div>}
                <ul style={{listStyle: 'none', padding: 0, margin: 0}}>
                    {conversations.map(conv => (
                        <li key={conv.id} style={{padding: '8px 0', borderBottom: '1px solid #f2f2f2', cursor:'pointer', position:'relative', display:'flex', alignItems:'center', justifyContent:'space-between'}}
                            onClick={async (e) => {
                                // 如果点击了菜单按钮，不触发会话选择
                                if ((e.target as HTMLElement).closest('.conv-menu-btn')) return;
                                try {
                                    const port = getBackendPort();
                                    const res = await fetch(`http://127.0.0.1:${port}/conversation/${conv.id}`, {
                                        credentials: 'include'
                                    });
                                    if (res.status === 401) {
                                        window.location.href = '/login';
                                        return;
                                    }
                                    const data = await res.json();
                                    if (onSelectConversation && data) {
                                        onSelectConversation({title: data.title, messages: data.messages, id: data.id});
                                    }
                                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                                } catch (e) {
                                    alert('获取会话历史失败');
                                }
                            }}
                        >
                            <div style={{flex:1, minWidth:0}}>
                                {renameId === conv.id ? (
                                    <form style={{display:'flex',alignItems:'center'}} onSubmit={e => {e.preventDefault();handleRename(conv.id);}}>
                                        <input value={renameValue} autoFocus onChange={e=>setRenameValue(e.target.value)} style={{fontWeight:500, fontSize:15, flex:1, marginRight:4}}/>
                                        <button type="submit" style={{marginRight:4}}>保存</button>
                                        <button type="button" onClick={()=>{setRenameId(null);setMenuOpenId(null);}}>取消</button>
                                    </form>
                                ) : (
                                    <>
                                        <div style={{fontWeight: 500, fontSize:15, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{conv.title}</div>
                                        <div style={{fontSize: 12, color: '#888'}}>{new Date(conv.created_at).toLocaleString()}</div>
                                    </>
                                )}
                            </div>
                            <button className="conv-menu-btn" style={{background:'none',border:'none',padding:'0 8px',cursor:'pointer',fontSize:18}} onClick={e => {e.stopPropagation(); setMenuOpenId(menuOpenId === conv.id ? null : conv.id); setRenameId(null);}}>
                                ...
                            </button>
                            {menuOpenId === conv.id && (
                                <div style={{position:'absolute',right:0,top:'100%',background:'#fff',boxShadow:'0 2px 8px rgba(0,0,0,0.12)',borderRadius:4,padding:4,zIndex:10,minWidth:90}} onClick={e=>e.stopPropagation()}>
                                    <button style={{display:'block',width:'100%',padding:'6px 8px',border:'none',background:'none',textAlign:'left',cursor:'pointer'}} onClick={()=>{setRenameId(conv.id);setRenameValue(conv.title);setMenuOpenId(null);}}>重命名</button>
                                    <button style={{display:'block',width:'100%',padding:'6px 8px',border:'none',background:'none',textAlign:'left',color:'red',cursor:'pointer'}} onClick={()=>handleDelete(conv.id)}>删除</button>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};
