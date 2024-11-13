import { Component, createRef, type JSX, isValidElement } from "preact"
import cx from "clsx/lite"
import { CloseIcon, getAsset, Loader } from "./assets.tsx"
import * as ToastState from "./state.ts"
import type { Position, ToastClassnames, ToasterProps, ToastProps, ToastT } from "./types.ts"
import { isAction } from "./types.ts"
import { HeightEvent, Heights } from "./heights.ts"

// Visible toasts amount
const VISIBLE_TOASTS_AMOUNT = 3

// Viewport padding
const VIEWPORT_OFFSET = "32px"

// Default lifetime of a toasts (in ms)
const TOAST_LIFETIME = 4000

// Default toast width
const TOAST_WIDTH = 356

// Default gap between toasts
const GAP = 14

// Threshold to dismiss a toast
const SWIPE_THRESHOLD = 20

// Equal to exit animation duration
const TIME_BEFORE_UNMOUNT = 200

const DEFAULT_HOTKEY = ["altKey", "KeyT"] as const

class Toast extends Component<ToastProps, never> implements EventListenerObject {

    #ac = new AbortController
    #closeTimerStartTime?: number
    #disabled = this.props.toast.type === "loading"
    #dismissible = this.props.toast.dismissible ?? true
    #dragStartTime?: number
    #li = createRef<HTMLLIElement>()
    #listenerOptions = { signal: this.#ac.signal, passive: true } as const satisfies AddEventListenerOptions
    #offsetBeforeRemove?: number
    #pointerStart?: PointerEvent
    #remainingTime?: number
    #removed = false
    #swipedOut = false
    #timeoutId?: ReturnType<typeof setTimeout>

    componentDidMount() {
        const { expandByDefault, heights, pauseWhenPageIsHidden, toast } = this.props
        const li = this.#li.current!
        
        const options = this.#listenerOptions
        heights.addEventListener(this, options)
        if (pauseWhenPageIsHidden) document.addEventListener("visibilitychange", this, options)
        
        for (const event of ["expand", "interact"] as const) {
            li.addEventListener(event, this, options)
        }
        
        const height = li.getBoundingClientRect().height
        heights.add({ toastId: toast.id, height, position: toast.position })
        li.style.setProperty("--initial-height", expandByDefault ? "auto" : `${height}px`)
        requestAnimationFrame(() => li.toggleAttribute("data-mounted", true))
        if (expandByDefault) li.toggleAttribute("data-expanded", true)
       
        const sticky =
            toast.duration === Infinity ||
            toast.type === "loading"

        if (!sticky) this.#startAutocloseTimer()
    }

    componentWillUnmount() {
        const { heights, toast } = this.props
        heights.remove(toast.id)
        this.#ac.abort()
    }

    handleEvent(event: Event) {
        const li = this.#li.current!
        if (event instanceof HeightEvent) {
            this.#updateOffset()
        } else if (event instanceof ExpandEvent) {
            li.toggleAttribute("data-expanded", event.expanded)
            if (event.expanded) {
                this.#pauseAutocloseTimer()
            } else {
                this.#startAutocloseTimer()
            }
        } else if (event instanceof InteractEvent) {
            if (event.interacting) {
                this.#pauseAutocloseTimer()
            } else {
                this.#startAutocloseTimer()
            }
        } else if (event instanceof MouseEvent) {
            if (event.type === "click" && event.target && event.target instanceof HTMLButtonElement) {
                const { toast } = this.props
                const { dataset } = event.target
                if (dataset.closeButton && this.#disabled === false && this.#dismissible) {
                    this.#deleteToast()
                    toast.onDismiss?.(toast)
                } else if (dataset.cancel && isAction(toast.cancel) && this.#dismissible) {
                    toast.cancel.onClick?.(event as JSX.TargetedMouseEvent<HTMLButtonElement>)
                    this.#deleteToast()
                } else if (dataset.action && isAction(toast.action)) {
                    toast.action.onClick?.(event as JSX.TargetedMouseEvent<HTMLButtonElement>)
                    if (!event.defaultPrevented) this.#deleteToast()
                }
            } else if (event instanceof PointerEvent) {
                if (event.type === "pointerdown") {
                    if (this.#disabled || !this.#dismissible) return
                    this.#dragStartTime = Date.now()
                    this.#offsetBeforeRemove = this.#updateOffset()
                    // Ensure we maintain correct pointer capture even when going outside of the toast (e.g. when swiping)
                    li.setPointerCapture(event.pointerId)
                    if (event.target && event.target instanceof HTMLButtonElement) {
                        li.toggleAttribute("data-swiping", true)
                        this.#pointerStart = event
                    }
                } else if (event.type === "pointermove") {
                    if (this.#pointerStart && this.#dismissible) {
                        const yPosition = event.clientY - this.#pointerStart.y
                        const isHighlighted = Boolean(getSelection()?.toString())
                        const swipeAmount = this.props.position.startsWith("top")
                            ? Math.min(0, yPosition)
                            : Math.max(0, yPosition)
                
                        if (Math.abs(swipeAmount) > 0) {
                            li.toggleAttribute("data-swiped", true)
                        }
                
                        if (isHighlighted) return
                
                        li.style.setProperty("--swipe-amount", `${swipeAmount}px`)
                    } 
                } else if (event.type === "pointerup") {
                    if (this.#swipedOut === false && this.#dismissible) {
                        const { toast } = this.props
                        this.#pointerStart = undefined
                        const swipeAmount = Number(li.style.getPropertyValue("--swipe-amount").replace("px", "") || 0)
                        const timeTaken = Date.now() - (this.#dragStartTime ?? 0)
                        const velocity = Math.abs(swipeAmount) / timeTaken
                        
                        // Remove only if threshold is met
                        if (Math.abs(swipeAmount) >= SWIPE_THRESHOLD || velocity > 0.11) {
                            this.#offsetBeforeRemove = this.#updateOffset()
                            toast.onDismiss?.(toast)
                            this.#deleteToast()
                            this.#swipedOut = true
                            li.toggleAttribute("data-swipe-out", true)
                            li.removeAttribute("data-swiped")
                            return
                        }
                        
                        li.style.setProperty("--swipe-amount", "0px")
                        li.removeAttribute("data-swiping")
                    }
                }
            }
        } else if (event.type === "visibilitychange") {
            if (document.visibilityState === "hidden") {
                this.#pauseAutocloseTimer()
            } else {
                this.#startAutocloseTimer()
            }
        }
    }

    #updateOffset() {
        const { heights, gap, toast } = this.props
        
        const offset =
            (this.#removed && this.#offsetBeforeRemove)
                ? this.#offsetBeforeRemove
                : heights.offset(toast.id, gap ?? GAP)
        
        this.#li.current!.style.setProperty("--offset", `${offset}px`)
        return offset
    }

    #deleteToast() {
        const { heights, removeToast, toast } = this.props
        this.#removed = true
        this.#li.current!.toggleAttribute("data-removed", true)
        this.#offsetBeforeRemove = this.#updateOffset()
        heights.remove(toast.id)
        setTimeout(removeToast, TIME_BEFORE_UNMOUNT, toast)
    }

    #startAutocloseTimer() {
        if (!this.#timeoutId) {
            const { duration, toast } = this.props
            this.#closeTimerStartTime = Date.now()
            this.#remainingTime ??= (toast.duration ?? duration ?? TOAST_LIFETIME)
            this.#timeoutId = setTimeout(Toast.#autoclose, this.#remainingTime, this)
        }
    }

    #pauseAutocloseTimer() {
        if (this.#closeTimerStartTime && this.#remainingTime && this.#timeoutId) {
            const elapsed = Date.now() - this.#closeTimerStartTime
            this.#remainingTime = Math.max(0, this.#remainingTime - elapsed)
            clearTimeout(this.#timeoutId)
            this.#timeoutId = undefined
        }
    }

    static #autoclose(t: Toast) {
        const { toast } = t.props
        toast.onAutoClose?.(toast)
        t.#deleteToast()
    }

    render(props: typeof this.props) {
        const { icons, index, position, toast, toastOptions } = props
        return <li
            tabIndex={0}
            ref={this.#li}
            class={cx(
                toastOptions?.class,
                toastOptions?.className,
                toast.class,
                toast.className,
                classes(props, "toast"),
                classes(props, "default"),
                toast.type && classes(props, toast.type)
            )}
            data-sonner-toast
            data-type={toast.type}
            {...data({
                richcolors: toast.richColors ?? props.defaultRichColors,
                unstyled: toast.jsx || toast.unstyled || toastOptions?.unstyled,
                promise: toast.promise,
                hide: index >= props.visibleToasts,
                top: position.startsWith("top"),
                bottom: position.startsWith("bottom"),
                left: position.endsWith("left"),
                center: position.endsWith("center"),
                right: position.endsWith("right"),
                front: index === 0,
                undismissible: !this.#dismissible,
                invert: toast.invert ?? props.invert,
            })}
            style={{
                "--toasts-before": index,
                "--z-index": props.toasts.length - index,
                "--initial-height": props.expandByDefault ? "auto" : "0",
                ...toastOptions?.style,
                ...toast.style,
            }}
        >{
            (toast.closeButton ?? (toastOptions?.closeButton || props.closeButton)) && !toast.jsx && (
                <button
                    data-close-button
                    class={classes(props, "closeButton")}
                    aria-label={props.closeButtonAriaLabel ?? "Close toast"}
                    data-disabled={this.#disabled || undefined}
                    ref={button => button?.addEventListener("click", this, this.#listenerOptions)}
                >{props.icons?.close ?? CloseIcon}</button>
            )
        }{
            toast.jsx ? toast.jsx :
            isValidElement(toast.title) ? toast.title :
            typeof toast.title === "function" ? toast.title() :
            <>{
                (toast.type || toast.icon || toast.promise) && <div data-icon class={classes(props, "icon")}>
                    {toast.promise || (toast.type === "loading" && !toast.icon) && (toast.icon ?? getLoadingIcon(props))}
                    {toast.type !== "loading" && (toast.icon ?? (toast.type && icons?.[toast.type]) ?? getAsset(toast.type))}
                </div>
            }
            <div data-content class={classes(props, "content")}>
                <div data-title class={classes(props, "title")}>
                    {typeof toast.title === "function" ? toast.title() : toast.title}
                </div>
                {toast.description && <div data-description class={classes(props, "description")}>
                    {typeof toast.description === "function" ? toast.description() : toast.description}
                </div>}
            </div>
            {isValidElement(toast.cancel) ? toast.cancel :
            toast.cancel && isAction(toast.cancel) && 
                <button
                    data-button
                    data-cancel
                    class={classes(props, "cancelButton")}
                    style={toast.cancelButtonStyle ?? toastOptions?.cancelButtonStyle}
                    ref={button => button?.addEventListener("click", this, this.#listenerOptions)}
                >{toast.cancel.label}</button>
            }
            {isValidElement(toast.action) ? toast.action :
            toast.action && isAction(toast.action) &&
                <button
                    data-button
                    data-action
                    class={classes(props, "actionButton")}
                    style={toast.actionButtonStyle ?? toastOptions?.actionButtonStyle}
                    ref={button => button?.addEventListener("click", this, this.#listenerOptions)}
                >{toast.action.label}</button>
            }
            </>
        }</li>
    }
}

interface ToasterState {
    toasts: ToastT[]
}

export class Toaster extends Component<ToasterProps, ToasterState> implements EventListenerObject {
    
    state: ToasterState = { toasts: [] }
    
    #ac = new AbortController
    #expanded = false
    #heights = new Heights
    #interacting = false
    #isFocusWithin = false
    #lastFocusedElement?: HTMLElement
    #ol = createRef<HTMLOListElement>()
    #unsubscribe?: () => void
    
    componentDidMount() {
        const options = { signal: this.#ac.signal, passive: true }
        if (this.props.theme === "system") {
            const prefersDark = matchMedia("(prefers-color-scheme: dark)")
            prefersDark.addEventListener("change", this, options)
        }
        for (const event of ["blur", "focus", "mouseenter", "mousemove", "mouseleave", "pointerdown", "pointerup"] as const) {
            this.#ol.current!.addEventListener(event, this, options)
        }
        document.addEventListener("keydown", this, options)
        this.#heights.addEventListener(this, options)
        this.#unsubscribe = ToastState.subscribe(this.#toastStateSubscriber)
    }
    
    componentWillUnmount() {
        this.#ac.abort()
        this.#unsubscribe?.()
        this.#restoreFocus()
    }
    
    handleEvent(event: Event) {
        const ol = this.#ol.current!
        if (event instanceof HeightEvent) {
            ol.style.setProperty("--front-toast-height", `${this.#heights.front() || 0}px`)
        } else if (event instanceof MediaQueryListEvent) {
            ol.setAttribute("data-theme", event.matches ? "dark" : "light")
        } else if (event instanceof FocusEvent) {
            if (event.type === "blur" && this.#isFocusWithin && ol.contains(event.relatedTarget as Node) === false) {
                this.#restoreFocus()
            } else if (event.type === "focus") {
                const undismissible =
                    event.target instanceof HTMLElement &&
                    event.target.dataset.undismissible === "true"
        
                if (undismissible === false && !this.#isFocusWithin) {
                    this.#isFocusWithin = true
                    this.#lastFocusedElement = event.relatedTarget as HTMLElement
                }
            }
        } else if (event instanceof MouseEvent) {
            if (event.type === "mouseenter" || event.type === "mousemove") {
                if (this.#expanded === false) this.#expand(true)
            } else if (event.type === "mouseleave" && this.#interacting === false && this.#expanded) {
                this.#expand(false)
            } else if (event instanceof PointerEvent) {
                if (event.type === "pointerdown") {
                    const undismissible =
                        event.target instanceof HTMLElement &&
                        event.target.dataset.undismissible === "true"
                    
                    if (undismissible === false) {
                        this.#interacting = true
                        for (const li of this.#ol.current!.children) {
                            li.dispatchEvent(new InteractEvent(true))
                        }
                    }
                } else if (event.type === "pointerup") {
                    this.#interacting = false
                    for (const li of ol.children) {
                        li.dispatchEvent(new InteractEvent(false))
                    }
                }
            }
        } if (event instanceof KeyboardEvent) {
            const { hotkey = DEFAULT_HOTKEY } = this.props
            const active = hotkey.every(key => (key in event && (event as any)[key]) || event.code === key)
            if (active) {
                this.#expand(true)
                ol.focus()
            } else if (event.code === "Escape") {
                if (document.activeElement === ol || ol.contains(document.activeElement)) {
                    this.#expand(false)
                }
            }
        }
    }

    #expand(expanded: boolean) {
        this.#expanded = expanded
        for (const li of this.#ol.current!.children) {
            li.dispatchEvent(new ExpandEvent(expanded))
        }
    }
    
    #restoreFocus() {
        if (this.#lastFocusedElement) {
            this.#lastFocusedElement.focus({ preventScroll: true })
            this.#lastFocusedElement = undefined
            this.#isFocusWithin = false
        }
    }
    
    #removeToast = (toastToRemove: ToastT) => {
        const { toasts } = this.state
        if (!toasts.find((toast) => toast.id === toastToRemove.id)?.delete) {
            ToastState.dismiss(toastToRemove.id)
        }
        this.setState({ toasts: toasts.filter(({ id }) => id !== toastToRemove.id) })
    }
    
    #toastStateSubscriber: ToastState.Subscriber = toast => {
        const { toasts } = this.state
        if ("dismiss" in toast && toast.dismiss) {
            this.setState({ toasts: toasts.map(t => t.id === toast.id ? { ...t, delete: true } : t) })
        } else {
            const existing = toasts.some(t => t.id === toast.id)
            if (existing) {
                this.setState({ toasts: toasts.map(t => t.id === toast.id ? toast : t) })
            } else {
                this.setState({ toasts: [toast, ...toasts] })
            }
        }
    }
    
    render(props: typeof this.props, state: typeof this.state) {
        const {
            dir = getDocumentDirection(),
            hotkey = DEFAULT_HOTKEY,
            position = "bottom-right",
            toastOptions,
        } = props
        
        const hotkeyLabel = hotkey.join("+").replace(/Key/g, "").replace(/Digit/g, "")
        
        const theme =
            props.theme === "light"                              ? "light"
            : props.theme === "dark"                             ? "dark"
            : typeof matchMedia === "undefined"                  ? "light"
            : matchMedia("(prefers-color-scheme: dark)").matches ? "dark"
            : "light"
        
        const _possiblePositions = new Set<Position>([ position ])
        for (const { position } of state.toasts) {
            if (position) _possiblePositions.add(position)
        }
        const possiblePositions = Array.from(_possiblePositions)
        
        // Remove item from normal navigation flow, only available via hotkey
        return <section
            tabIndex={-1}
            aria-label={`${props.containerAriaLabel ?? "Notifications"} ${hotkeyLabel}`}
            aria-live="polite"
            aria-relevant="additions text"
            aria-atomic="false"
        >{
            possiblePositions.map((position, index) => <ol
                key={position}
                ref={this.#ol}
                tabIndex={-1}
                data-sonner-toaster
                class={cx(props.class, props.className) || undefined}
                dir={dir === "auto" ? getDocumentDirection() : dir}
                data-theme={theme}
                {...data({
                    top: position.startsWith("top"),
                    bottom: position.startsWith("bottom"),
                    left: position.endsWith("left"),
                    center: position.endsWith("center"),
                    right: position.endsWith("right"),
                    lifted: this.#expanded && state.toasts.length > 1 && !props.expand,
                })}
                style={{
                    "--front-toast-height": `${this.#heights.front() || 0}px`,
                    "--offset": typeof props.offset === "number" ? `${props.offset}px` : props.offset ?? VIEWPORT_OFFSET,
                    "--width": `${TOAST_WIDTH}px`,
                    "--gap": `${props.gap ?? GAP}px`,
                    ...props.style,
                }}
            >{
                state.toasts
                .filter(toast => (!toast.position && index === 0) || toast.position === position)
                .map((toast, index) => <Toast
                    key={toast.id}
                    icons={props.icons}
                    index={index}
                    toast={toast}
                    defaultRichColors={props.richColors}
                    toastOptions={toastOptions}
                    duration={props.duration}
                    invert={props.invert}
                    visibleToasts={props.visibleToasts ?? VISIBLE_TOASTS_AMOUNT}
                    closeButton={props.closeButton}
                    position={position}
                    removeToast={this.#removeToast}
                    toasts={state.toasts.filter(t => t.position === toast.position)}
                    heights={this.#heights}
                    expandByDefault={props.expand ?? false}
                    gap={props.gap ?? GAP}
                    pauseWhenPageIsHidden={props.pauseWhenPageIsHidden ?? false}
                />
            )}</ol>
        )}
        </section>
    }
}

class ExpandEvent extends Event {
    constructor(readonly expanded: boolean) {
        super("expand")
    }
}

class InteractEvent extends Event {
    constructor(readonly interacting: boolean) {
        super("interact")
    }
}

function getLoadingIcon(props: ToastProps) {
    if (props.icons?.loading) {
        return <div
            class={cx(classes(props, "loader"), "sonner-loader")}
            data-hide={(props.toast.type !== "loading") || undefined}
        >{props.icons.loading}</div>
    }
    return <Loader class={classes(props, "loader")} visible={props.toast.type === "loading"} />
}

function getDocumentDirection(): ToasterProps["dir"] {
    if (typeof window === "undefined") return "ltr"
    // For Fresh purpose
    if (typeof document === "undefined") return "ltr"

    const dirAttribute = document.documentElement.getAttribute("dir")

    if (dirAttribute === "auto" || !dirAttribute) {
        return getComputedStyle(document.body).direction as ToasterProps["dir"]
    }

    return dirAttribute as ToasterProps["dir"]
}

function data<Data>(object: Data): {
    // @ts-expect-error
    [K in `data-${keyof Data}`]?: true
} {
    const attributes = {}
    for (const key in object) {
        // @ts-expect-error
        if (object[key]) attributes[`data-${key}`] = true
    }
    return attributes
}

function classes({ toast, toastOptions }: ToastProps, component: keyof ToastClassnames) {
    return cx(
        toastOptions?.classes?.[component],
        toastOptions?.classNames?.[component],
        toast?.classes?.[component],
        toast?.classNames?.[component]
    ) || undefined
}
