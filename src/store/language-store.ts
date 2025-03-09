import {atom} from "jotai";
import {cn} from "@/locales/cn";

export const LanguageStore = atom({
    language: "cn" as "jp" | "en" | "cn",
    languagePack: cn
})