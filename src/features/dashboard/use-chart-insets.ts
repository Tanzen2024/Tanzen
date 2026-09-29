import { useEffect, useRef, useState } from 'react';

// Recharts 2 draws a left YAxis tick label ending at `x + width - tickSize - tickMargin` (6 + 2 by default).
const Y_TICK_OFFSET = 8;
const DEFAULT_Y_AXIS_WIDTH = 60;

function widestTick(root: HTMLElement, selector: string) {
  const nodes = Array.from(root.querySelectorAll<SVGGraphicsElement>(selector)).filter((node) => typeof node.getBBox === 'function');
  return nodes.length ? Math.max(...nodes.map((node) => node.getBBox().width)) : null;
}

/**
 * Sizes a chart's Y axis and right inset from the tick labels actually rendered (Recharts 2 has no `width="auto"`),
 * so labels are never pushed outside the SVG viewport, whatever their length or the inherited font size.
 */
export function useChartInsets({ minRight = 8 }: { minRight?: number } = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const [insets, setInsets] = useState({ yAxisWidth: DEFAULT_Y_AXIS_WIDTH, right: minRight });
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const measure = () => {
      const yWidest = widestTick(root, '.recharts-yAxis .recharts-cartesian-axis-tick-value');
      const xWidest = widestTick(root, '.recharts-xAxis .recharts-cartesian-axis-tick-value');
      const yAxisWidth = yWidest === null ? DEFAULT_Y_AXIS_WIDTH : Math.ceil(yWidest) + Y_TICK_OFFSET;
      // The last X label is centred on the right edge of the plot: keep half of it inside the SVG.
      const right = xWidest === null ? minRight : Math.max(minRight, Math.ceil(xWidest / 2) + 2);
      setInsets((current) => (current.yAxisWidth === yAxisWidth && current.right === right ? current : { yAxisWidth, right }));
    };
    measure();
    // ResponsiveContainer renders the SVG asynchronously and ticks change with data/height: re-measure on DOM changes.
    const observer = new MutationObserver(measure);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [minRight]);
  return { ref, ...insets };
}
