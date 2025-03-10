'use client'
import {useAtom} from "jotai";
import {ChatBoxInput} from "@/components/chat-box/chat-box-input";
import {cn} from "@/lib/utils";
import {ChatMessage, ChatStore} from "@/store/chat-message-store";

export function ChatBox() {
    const [chatStore]=useAtom(ChatStore)
    return <div className={"w-full h-full flex flex-col items-center"}>
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