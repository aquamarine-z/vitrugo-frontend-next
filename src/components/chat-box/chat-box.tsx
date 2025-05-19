'use client'
import React, {useEffect, useRef} from "react";
import {useAtom} from "jotai";
import {ChatBoxInput} from "@/components/chat-box/chat-box-input";
import {cn} from "@/lib/utils";
import {ChatMessage, ChatStore} from "@/store/chat-message-store";
import {ConversationSidebar} from "@/components/chat-box/conversation-sidebar";
import {RoomStateStore} from "@/store/room-state-store";

interface ChatBoxProps {
    sidebarOpen: boolean;
    setSidebarOpen: (open: boolean) => void;
}


export function ChatBox({ sidebarOpen, setSidebarOpen }: ChatBoxProps) {
    const [chatStore, setChatStore]=useAtom(ChatStore)

    const [, setRoomState] = useAtom(RoomStateStore);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [currentTitle, setCurrentTitle] = React.useState("当前会话")
    const [initialLoadDone, setInitialLoadDone] = React.useState(false)
    // 处理会话选择
    const handleSelectConversation = React.useCallback((data: {title: string, messages:[], id?: number}) => {
        setCurrentTitle(data.title || "会话");
        // 转换消息格式，确保 type 字段类型安全
        const messages = (data.messages || []).map((msg:{role:string,content:string,senderName:string}) => {
            let type: "user" | "assistant" | "system" = "user";
            if (msg.role === "assistant") type = "assistant";
            else if (msg.role === "system") type = "system";
            else type = "user";
            return {
                content: msg.content,
                name: msg.senderName || (type === 'assistant' ? 'AI' : '用户'),
                type,
                avatar: undefined
            };
        });
        setChatStore({ messages });
        setSidebarOpen(false);
        // 设置当前 sessionId，兼容 id 可能为 undefined
        setRoomState(prev => ({ ...prev, sessionId: data.id }));
    }, [setChatStore, setSidebarOpen, setRoomState]);

    // 获取后端端口号
    const getBackendPort = React.useCallback(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('backendPort') || '8081';
        }
        return '8081';
    }, []);

    // 自动加载最新的会话
    useEffect(() => {
        if (initialLoadDone) return;
        
        const loadLatestConversation = async () => {
            try {
                const port = getBackendPort();
                // 获取所有会话
                const conversationsRes = await fetch(`http://127.0.0.1:${port}/conversation`, {
                    credentials: 'include'
                });
                
                if (conversationsRes.status === 401) {
                    // 未登录，不进行处理
                    return;
                }
                
                const data = await conversationsRes.json();
                if (Array.isArray(data.conversations) && data.conversations.length > 0) {
                    // 按更新时间降序排序，获取最新的会话
                    const latestConversation = [...data.conversations].sort(
                        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
                    )[0];
                    
                    // 获取该会话的详细内容
                    const conversationDetailRes = await fetch(`http://127.0.0.1:${port}/conversation/${latestConversation.id}`, {
                        credentials: 'include'
                    });
                    
                    if (conversationDetailRes.ok) {
                        const detailData = await conversationDetailRes.json();
                        handleSelectConversation({
                            title: detailData.title,
                            messages: detailData.messages,
                            id: detailData.id
                        });
                    }
                }
            } catch (error) {
                console.error('自动加载最新会话失败:', error);
            } finally {
                setInitialLoadDone(true);
            }
        };
        
        loadLatestConversation();
    }, [getBackendPort, handleSelectConversation, initialLoadDone]);
    
    // 当消息更新时，滚动到底部
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chatStore.messages]);

    return <div className={"w-full h-full flex flex-col items-center relative"}>
        {/* 会话栏 */
        }

        {
            <ConversationSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)}
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                //@ts-ignore
                                 onSelectConversation={handleSelectConversation}/>}
        {/* 顶部标题栏 */}
        <div className="w-full flex items-center justify-center relative" style={{height:48}}>
            {/* 左侧按钮 */}
            <button onClick={()=>setSidebarOpen(true)} style={{position:'absolute',left:16,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',padding:0,cursor:'pointer'}} aria-label="打开会话栏">
                <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <rect x="3" y="5" width="18" height="14" rx="2"/>
                    <path d="M8 9h8M8 13h6"/>
                </svg>
            </button>
            {/* 标题 */}
            <span className="text-lg font-bold select-none">{currentTitle}</span>
        </div>
        {/* 聊天内容 */}
        <div className={"w-full h-[75%] overflow-y-scroll border-b-1 border-b-foreground/50 mb-2 px-2 pt-2"}>
            {chatStore.messages.map((message: ChatMessage, index) => {
                return <div key={index}
                            className={cn("w-full h-fit flex gap-2 my-3 ", message.type === "user" ? "flex-row-reverse " : "flex-row")}> 
                    <div className={"h-full w-fit"}>
                        {message.avatar && message.avatar !== "" ?
                            <img src={message.avatar || ""} alt={""} className={"w-6 h-6 rounded-full"}/> :
                            <div className={"w-6 h-6  bg-foreground rounded-full"}/>
                        }
                    </div>
                    <div
                        className={cn("max-w-[75%] w-fit h-full flex flex-col gap-2", message.type === "user" ? "items-end" : "items-start")}> 
                        <p className={"text-sm font-semibold w-fit"}>{message.name || "Display Name"}</p>
                        <div className={cn("h-fit w-fit rounded-sm shadow p-2 flex-col justify-start",message.type==="user"?"items-end":"items-start ")}> 
                            <p className={"text-sm w-fit"}>{message.content || " "}</p>
                        </div>
                    </div>
                </div>
            })}
            {/* 占位，用于滚动到底部 */}
            <div ref={messagesEndRef} />
        </div>
        <div className={"w-full h-[25%]"}>
            <ChatBoxInput/>
        </div>
    </div>
}