import {atom} from "jotai";
import {z} from "zod"


export const ChatMessageSchema = z.object({
    content: z.string(),
    avatar: z.string().optional().nullable(),
    name:z.string().nullable().optional(),
    type:z.enum(["user","assistant","system"]),
})
export type ChatMessage = z.infer<typeof ChatMessageSchema>
export const ChatStore = atom({
    messages: [] as ChatMessage[],
    subtitle:"",
    subtitleVisible:false,
})