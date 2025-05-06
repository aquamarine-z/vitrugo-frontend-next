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
}

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({ open, onClose }) => {
    const [loading, setLoading] = useState(false);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        setError(null);
        fetch(`http://127.0.0.1:8081/conversation`, {
            credentials: 'include'
        })
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data.conversations)) {
                    // 按 created_at 升序
                    setConversations((data.conversations as Conversation[]).sort((a: Conversation, b: Conversation) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
                } else {
                    setConversations([]);
                }
            })
            .catch(err => {
                setError('获取会话失败');
                setConversations([]);
            })
            .finally(() => setLoading(false));
    }, [open]);

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
                <button onClick={onClose} style={{background: 'none', border: 'none', cursor: 'pointer', padding: 0}} aria-label="关闭">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>
                </button>
            </div>
            <div style={{flex: 1, overflowY: 'auto', padding: 16}}>
                {loading && <div>加载中...</div>}
                {error && <div style={{color: 'red'}}>{error}</div>}
                {!loading && !error && conversations.length === 0 && <div>暂无会话</div>}
                <ul style={{listStyle: 'none', padding: 0, margin: 0}}>
                    {conversations.map(conv => (
                        <li key={conv.id} style={{padding: '8px 0', borderBottom: '1px solid #f2f2f2'}}>
                            <div style={{fontWeight: 500}}>{conv.title}</div>
                            <div style={{fontSize: 12, color: '#888'}}>{new Date(conv.created_at).toLocaleString()}</div>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};
