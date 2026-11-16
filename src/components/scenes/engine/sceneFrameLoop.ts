// Demand-driven scene frames use the globally capped RAF and sleep when hidden or settled.
export const createSceneFrameLoop = (
    frame: (now: number) => boolean,
    canDraw: () => boolean,
    request: typeof requestAnimationFrame = requestAnimationFrame,
    cancel: typeof cancelAnimationFrame = cancelAnimationFrame,
) => {
    let pending = 0;
    let disposed = false;
    const stop = () => {
        if (pending) cancel(pending);
        pending = 0;
    };
    const tick = (now: number) => {
        pending = 0;
        if (disposed || !canDraw()) return;
        if (frame(now)) wake();
    };
    const wake = () => {
        if (disposed || !canDraw()) { stop(); return; }
        if (!pending) pending = request(tick);
    };
    return { wake, dispose: () => { disposed = true; stop(); } };
};
