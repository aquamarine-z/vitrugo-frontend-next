
import {z} from "zod"
import {atomWithStorage} from "jotai/utils";



export const ChatMessageSchema = z.object({
    content: z.string(),
    avatar: z.string().optional().nullable(),
    name:z.string().nullable().optional(),
    type:z.enum(["user","assistant","system"]),
})
export type ChatMessage = z.infer<typeof ChatMessageSchema>
export const ChatStore = atomWithStorage("chat-store",{
    messages: [] as ChatMessage[],
    subtitle:"",
    subtitleVisible:false,
})