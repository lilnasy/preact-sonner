import type { JSX, ComponentChildren } from "preact"
import type { Heights } from "./heights.ts"

export type ToastTypes =
    | "normal"
    | "action"
    | "success"
    | "info"
    | "warning"
    | "error"
    | "loading"
    | "default"

export type PromiseT<Data = any> = Promise<Data> | (() => Promise<Data>)

export type PromiseTResult<Data = any> =
    | string
    | ComponentChildren
    | ((data: Data) => ComponentChildren | string | Promise<ComponentChildren | string>)

export type PromiseExternalToast = Omit<ExternalToast, "description">

export type PromiseData<ToastData = any> = PromiseExternalToast & {
    loading?: string | ComponentChildren
    success?: PromiseTResult<ToastData>
    error?: PromiseTResult
    description?: PromiseTResult
    finally?: () => void | Promise<void>
}

export interface ToastClassnames {
    toast?: string
    title?: string
    description?: string
    loader?: string
    closeButton?: string
    cancelButton?: string
    actionButton?: string
    action?: string
    normal?: string
    success?: string
    error?: string
    info?: string
    warning?: string
    loading?: string
    default?: string
    content?: string
    icon?: string
}
export interface ToastIcons {
    default?: ComponentChildren
    normal?: ComponentChildren
    action?: ComponentChildren
    success?: ComponentChildren
    info?: ComponentChildren
    warning?: ComponentChildren
    error?: ComponentChildren
    loading?: ComponentChildren
    close?: ComponentChildren
}

export interface Action {
    label: ComponentChildren
    onClick: (event: JSX.TargetedMouseEvent<HTMLButtonElement>) => void
    actionButtonStyle?: JSX.CSSProperties
}

export interface ToastT {
    id: number | string
    title?: (() => ComponentChildren) | ComponentChildren
    type?: ToastTypes
    icon?: ComponentChildren
    jsx?: ComponentChildren
    richColors?: boolean
    invert?: boolean
    closeButton?: boolean
    dismissible?: boolean
    description?: (() => ComponentChildren) | ComponentChildren
    duration?: number
    delete?: boolean
    action?: Action | ComponentChildren
    cancel?: Action | ComponentChildren
    onDismiss?: (toast: ToastT) => void
    onAutoClose?: (toast: ToastT) => void
    promise?: PromiseT
    cancelButtonStyle?: JSX.CSSProperties
    actionButtonStyle?: JSX.CSSProperties
    style?: JSX.CSSProperties
    unstyled?: boolean
    class?: string
    className?: string
    classes?: ToastClassnames
    classNames?: ToastClassnames
    position?: Position
}

export function isAction(action: Action | ComponentChildren): action is Action {
    return (action as Action).label !== undefined
}

export type Position =
    | "top-left"
    | "top-center"
    | "top-right"
    | "bottom-left"
    | "bottom-center"
    | "bottom-right"

export interface HeightT {
    height: number
    toastId: number | string
    position?: Position
}

interface ToastOptions {
    class?: string
    className?: string
    classes?: ToastClassnames
    classNames?: ToastClassnames
    closeButton?: boolean
    style?: JSX.CSSProperties
    cancelButtonStyle?: JSX.CSSProperties
    actionButtonStyle?: JSX.CSSProperties
    duration?: number
    unstyled?: boolean
}


export interface ToasterProps {
    invert?: boolean
    theme?: "light" | "dark" | "system"
    position?: Position
    hotkey?: string[]
    richColors?: boolean
    expand?: boolean
    duration?: number
    gap?: number
    visibleToasts?: number
    closeButton?: boolean
    toastOptions?: ToastOptions
    class?: string
    className?: string
    style?: JSX.CSSProperties
    offset?: string | number
    dir?: "rtl" | "ltr" | "auto"
    icons?: ToastIcons
    containerAriaLabel?: string
    pauseWhenPageIsHidden?: boolean
}

export interface ToastProps {
    heights: Heights
    toast: ToastT
    toasts: ToastT[]
    index: number
    invert?: boolean
    removeToast: (toast: ToastT) => void
    gap?: number
    position: Position
    visibleToasts: number
    expandByDefault: boolean
    closeButton?: boolean
    duration?: number
    icons?: ToastIcons
    closeButtonAriaLabel?: string
    pauseWhenPageIsHidden: boolean
    defaultRichColors?: boolean
    toastOptions?: ToastOptions
}

export enum SwipeStateTypes {
    SwipedOut = "SwipedOut",
    SwipedBack = "SwipedBack",
    NotSwiped = "NotSwiped",
}

export type Theme = "light" | "dark"

export interface ToastToDismiss {
    id: number | string
    dismiss: boolean
}

export type ExternalToast = Omit<ToastT, "id" | "type" | "title" | "jsx" | "delete" | "promise"> & {
    id?: number | string
}