'use client'
import {useAtom} from "jotai";
import {ChatMessage, ChatStore} from "@/app/store/chat-store";
import {ChatBoxInput} from "@/components/chat-box/chat-box-input";

export function ChatBox() {
    const [chatStore] = useAtom(ChatStore)
    return <div className={"w-full h-full flex flex-col items-center"}>
        <div className={"w-full h-[75%] overflow-y-scroll border-b-1 border-b-foreground/50 mb-2 px-2 pt-2"}>
            {chatStore.messages.map((message: ChatMessage, index) => {
                return <div key={index} className={"w-full h-fit flex flex-row gap-2 my-1"}>
                    <div className={"h-full w-fit"}>
                        {message.avatar && message.avatar !== "" ?
                            <img src={message.avatar || ""} alt={""} className={"w-6 h-6 rounded-full"}/> :
                            <div className={"w-6 h-6  bg-foreground rounded-full"}/>
                        }

                    </div>
                    <div className={"w-full h-full flex flex-col gap-2"}>
                        <p className={"text-sm font-semibold"}>{message.name || "Display Name"}</p>
                        <div className={"h-fit w-full rounded-sm shadow p-2 flex-col justify-start items-start"}>

                            <p className={"text-sm"}>{message.content}</p>
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