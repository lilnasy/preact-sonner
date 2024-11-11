import type { HeightT } from "./types.ts"

export class Heights {
    #heights: HeightT[] = []
    #et = new EventTarget
    addEventListener(listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean) {
        this.#et.addEventListener("height", listener, options)
    }
    #announce() {
        this.#et.dispatchEvent(new HeightEvent)
    }
    add(height: HeightT) {
        this.#heights = [height, ...this.#heights]
        this.#announce()
    }
    remove(id: number | string) {
        this.#heights = this.#heights.filter(h => h.toastId !== id)
        this.#announce()
    }
    front(): number | undefined {
        return this.#heights[0]?.height
    }
    offset(id: number | string, gap: number) {
        let offset = 0
        for (const height of this.#heights) {
            if (height.toastId === id) break
            offset += height.height + gap
        }
        return offset
    }
}

export class HeightEvent extends Event {
    constructor() {
        super("height")
    }
}
