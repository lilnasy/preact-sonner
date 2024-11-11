import { isValidElement, type ComponentChildren } from "preact"
import type { ExternalToast, PromiseData, PromiseT, ToastT, ToastToDismiss, ToastTypes } from "./types.ts"

type titleT = (() => ComponentChildren) | ComponentChildren

export interface Subscriber {
    (toast: ToastT | ToastToDismiss): unknown
}

let toastsCounter = 1
const subscribers = new Set<Subscriber>()
const toasts = new Array<ToastT | ToastToDismiss>()

export function subscribe(subscriber: Subscriber) {
    subscribers.add(subscriber)
    return () => subscribers.delete(subscriber)
}

export function publish(data: ToastT) {
    for (const subscriber of subscribers) {
        subscriber(data)
    }
}

export function addToast(data: ToastT) {
    publish(data)
    toasts.push(data)
}

export interface CreateToastData extends ExternalToast {    
    message?: titleT
    type?: ToastTypes
    promise?: PromiseT
    jsx?: ComponentChildren
}

export function create(data: CreateToastData) {
    const { message, ...rest } = data
    const id = typeof data?.id === "number" || (typeof data?.id === "string" && data.id.length > 0) ? data.id : toastsCounter++
    const dismissible = data.dismissible ?? true
    
    let alreadyExists = false

    for (let i = 0; i < toasts.length; i++) {
        const toast = toasts[i]
        if (toast.id === id) {
            alreadyExists = true
            publish({ ...toast, ...data, id, title: message })
            toasts[i] = { ...toast, ...data, id, dismissible, title: message }
        }
    }

    if (!alreadyExists) {
        addToast({ title: message, ...rest, dismissible, id })
    }

    return id
}

export function dismiss(id?: number | string) {
    if (!id) {
        for (const toast of toasts) {
            for (const subscriber of subscribers) {
                subscriber({ id: toast.id, dismiss: true })
            }
        }
    } else {
        for (const subscriber of subscribers) {
            subscriber({ id, dismiss: true })
        }
    }
    return id
}

export function show(message: titleT, data?: ExternalToast) {
    const id = data?.id || toastsCounter++
    addToast({ title: message, ...data, id })
    return id
}

export function message(message: titleT, data?: ExternalToast) {
    return create({ ...data, message })
}

export function error(message: titleT, data?: ExternalToast) {
    return create({ ...data, message, type: "error" })
}

export function success(message: titleT, data?: ExternalToast) {
    return create({ ...data, type: "success", message })
}

export function info(message: titleT, data?: ExternalToast) {
    return create({ ...data, type: "info", message })
}

export function warning(message: titleT, data?: ExternalToast) {
    return create({ ...data, type: "warning", message })
}

export function loading(message: titleT, data?: ExternalToast) {
    return create({ ...data, type: "loading", message })
}

export function promise<ToastData>(promise: PromiseT<ToastData>, data?: PromiseData<ToastData>) {
    if (!data) {
        // Nothing to show
        return
    }

    let id: string | number | undefined = undefined
    if (data.loading !== undefined) {
        id = create({
            ...data,
            promise,
            type: "loading",
            message: data.loading,
            description: typeof data.description !== "function" ? data.description : undefined,
        })
    }

    const p = promise instanceof Promise ? promise : promise()

    let shouldDismiss = id !== undefined
    let result: ["resolve", ToastData] | ["reject", unknown]

    const originalPromise = p
        .then(async (response) => {
            result = ["resolve", response]
            if (isValidElement(response)) {
                shouldDismiss = false
                create({ id, type: "default", message: response })
            } else if (isHttpResponse(response) && !response.ok) {
                shouldDismiss = false
                const message =
                    typeof data.error === "function" ? await data.error(`HTTP error! status: ${response.status}`) : data.error
                const description =
                    typeof data.description === "function"
                        ? await data.description(`HTTP error! status: ${response.status}`)
                        : data.description
                create({ id, type: "error", message, description })
            } else if (data.success !== undefined) {
                shouldDismiss = false
                const message = typeof data.success === "function" ? await data.success(response) : data.success
                const description =
                    typeof data.description === "function" ? await data.description(response) : data.description
                create({ id, type: "success", message, description })
            }
        })
        .catch(async (error) => {
            result = ["reject", error]
            if (data.error !== undefined) {
                shouldDismiss = false
                const message = typeof data.error === "function" ? await data.error(error) : data.error
                const description = typeof data.description === "function" ? await data.description(error) : data.description
                create({ id, type: "error", message, description })
            }
        })
        .finally(() => {
            if (shouldDismiss) {
                // Toast is still in load state (and will be indefinitely — dismiss it)
                dismiss(id)
                id = undefined
            }

            data.finally?.()
        })

    const unwrap = () =>
        new Promise<ToastData>((resolve, reject) =>
            originalPromise.then(() => (result[0] === "reject" ? reject(result[1]) : resolve(result[1]))).catch(reject),
        )

    if (typeof id !== "string" && typeof id !== "number") {
        // cannot Object.assign on undefined
        return { unwrap }
    } else {
        return Object.assign(id, { unwrap })
    }
}

export function custom(jsx: (id: number | string) => ComponentChildren, data?: ExternalToast) {
    const id = data?.id || toastsCounter++
    create({ jsx: jsx(id), id, ...data })
    return id
}

export function getHistory() {
    return toasts.slice()
}

function isHttpResponse(data: any): data is Response {
    return (
        data &&
        typeof data === "object" &&
        "ok" in data &&
        typeof data.ok === "boolean" &&
        "status" in data &&
        typeof data.status === "number"
    )
}
