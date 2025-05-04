'use client'
import React from "react";
import {useAtom} from "jotai";
import {ChatBoxInput} from "@/components/chat-box/chat-box-input";
import {cn} from "@/lib/utils";
import {ChatMessage, ChatStore} from "@/store/chat-message-store";
import {ConversationSidebar} from "@/components/chat-box/conversation-sidebar";

interface ChatBoxProps {
    sidebarOpen: boolean;
    setSidebarOpen: (open: boolean) => void;
}

export function ChatBox({ sidebarOpen, setSidebarOpen }: ChatBoxProps) {
    const [chatStore]=useAtom(ChatStore)
    // 当前会话标题（可根据实际业务调整）
    const currentTitle = "当前会话";
    return <div className={"w-full h-full flex flex-col items-center relative"}>
        {/* 遮罩层 */}
        {sidebarOpen && <div style={{position:'fixed',left:0,top:0,right:0,bottom:0,zIndex:2999,background:'rgba(0,0,0,0.15)'}} onClick={()=>setSidebarOpen(false)}/>} 
        {/* 会话栏 */}
        <ConversationSidebar open={sidebarOpen} onClose={()=>setSidebarOpen(false)} />
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
        </div>
        <div className={"w-full h-[25%]"}>
            <ChatBoxInput/>
        </div>
    </div>
}