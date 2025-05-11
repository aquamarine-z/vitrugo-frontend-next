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
    const [roomState, setRoomState] = useAtom(RoomStateStore);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [currentTitle, setCurrentTitle] = React.useState("当前会话")
    // 处理会话选择
    const handleSelectConversation = React.useCallback((data: {title: string, messages: any[], id?: number}) => {
        setCurrentTitle(data.title || "会话");
        // 转换消息格式，确保 type 字段类型安全
        const messages = (data.messages || []).map((msg: any) => {
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
    // 当消息更新时，滚动到底部
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chatStore.messages]);
    return <div className={"w-full h-full flex flex-col items-center relative"}>
        {/* 会话栏 */}
        <ConversationSidebar open={sidebarOpen} onClose={()=>setSidebarOpen(false)} onSelectConversation={handleSelectConversation} />
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