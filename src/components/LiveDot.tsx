/**
 * The on-air dot, breathing on one shared clock. A CSS animation starts when its element
 * mounts, so two dots on one screen — the chyron's and a round chip's that appears on
 * selection — used to breathe out of phase. A negative animation-delay taken from the
 * page clock puts every dot in the app on the same beat, whenever it appears.
 */
const PERIOD_MS = 2200;

export default function LiveDot({ className = "" }: { className?: string }) {
  // Set on the element itself, not in render: the phase is read from the clock at mount.
  const sync = (el: HTMLSpanElement | null) => {
    if (el) el.style.animationDelay = `${-(performance.now() % PERIOD_MS)}ms`;
  };
  return <span ref={sync} className={`live-dot ${className}`} aria-hidden="true" />;
}
