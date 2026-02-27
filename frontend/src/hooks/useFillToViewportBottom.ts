import { useEffect, useRef, useState } from 'react';

interface UseFillToViewportBottomOptions {
  bottomOffsetPx?: number;
  minHeightPx?: number;
}

export function useFillToViewportBottom(
  options: UseFillToViewportBottomOptions = {},
) {
  const { bottomOffsetPx = 24, minHeightPx = 360 } = options;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [filledMinHeightPx, setFilledMinHeightPx] = useState(minHeightPx);

  useEffect(() => {
    let rafId: number | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const measure = () => {
      const element = containerRef.current;
      if (!element) return;

      const top = element.getBoundingClientRect().top;
      const available = window.innerHeight - top - bottomOffsetPx;
      const next = Math.max(minHeightPx, Math.floor(available));
      setFilledMinHeightPx((prev) => (prev === next ? prev : next));
    };

    const scheduleMeasure = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        measure();
      });
    };

    scheduleMeasure();
    window.addEventListener('resize', scheduleMeasure);

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        scheduleMeasure();
      });

      const element = containerRef.current;
      if (element) {
        resizeObserver.observe(element);
        if (element.parentElement) {
          resizeObserver.observe(element.parentElement);
        }
      }
    }

    return () => {
      window.removeEventListener('resize', scheduleMeasure);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [bottomOffsetPx, minHeightPx]);

  return { containerRef, filledMinHeightPx };
}
