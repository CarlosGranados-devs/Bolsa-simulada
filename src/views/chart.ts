import {
  AreaSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";
import type { PricePoint } from "../models/types";
import type { Time, UTCTimestamp } from "lightweight-charts";

const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

function formatChartTime(time: Time): string {
  if (typeof time !== "number") {
    return "";
  }
  const date = new Date(time * 1000);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export class PriceChart {
  private readonly chart: IChartApi;
  private readonly series: ISeriesApi<"Area">;
  private lastTime = 0;

  constructor(container: HTMLElement) {
    this.chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8b8b95",
        fontFamily: MONO_FONT,
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.035)" },
        horzLines: { color: "rgba(255, 255, 255, 0.035)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(225, 29, 46, 0.45)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#e11d2e",
        },
        horzLine: {
          color: "rgba(225, 29, 46, 0.3)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#22222a",
        },
      },
      rightPriceScale: {
        borderColor: "rgba(255, 255, 255, 0.09)",
        scaleMargins: { top: 0.14, bottom: 0.08 },
      },
      timeScale: {
        borderColor: "rgba(255, 255, 255, 0.09)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 2,
        barSpacing: 5,
        minBarSpacing: 1.5,
        tickMarkFormatter: formatChartTime,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
      localization: {
        priceFormatter: (price: number) => `$${price.toFixed(2)}`,
        timeFormatter: formatChartTime,
      },
    });

    this.series = this.chart.addSeries(AreaSeries, {
      lineColor: "#e11d2e",
      topColor: "rgba(225, 29, 46, 0.32)",
      bottomColor: "rgba(225, 29, 46, 0.01)",
      lineWidth: 2,
      priceLineColor: "rgba(225, 29, 46, 0.7)",
      priceLineWidth: 1,
      priceLineStyle: LineStyle.Dashed,
      lastValueVisible: true,
      priceLineVisible: true,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 3,
      crosshairMarkerBorderColor: "#070708",
      crosshairMarkerBackgroundColor: "#e11d2e",
      priceFormat: {
        type: "price",
        precision: 2,
        minMove: 0.01,
      },
    });
  }

  setData(points: PricePoint[]): void {
    this.lastTime = 0;
    this.series.setData(
      points.map((point) => ({
        time: point.time as UTCTimestamp,
        value: point.value,
      })),
    );
    if (points.length > 0) {
      this.lastTime = points[points.length - 1]!.time;
      this.chart.timeScale().fitContent();
    }
  }

  update(point: PricePoint): void {
    const time = point.time > this.lastTime ? point.time : this.lastTime + 1;
    this.lastTime = time;
    this.series.update({ time: time as UTCTimestamp, value: point.value });
  }

  clear(): void {
    this.lastTime = 0;
    this.series.setData([]);
  }

  dispose(): void {
    this.chart.remove();
  }
}
