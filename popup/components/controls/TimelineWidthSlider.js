import * as SliderPrimitive from "@radix-ui/react-slider";

import { KeyTimelineWidth } from "../../../storage-keys";
import { useStorageValueState } from "../../utilities/useStorageKeyState";

const widths = [600, 650, 700, 750, 800];

const TimelineWidthSlider = () => {
  const [stored, setWidth] = useStorageValueState(KeyTimelineWidth);
  const width = widths.includes(stored) ? stored : 700;

  return (
    <div className="zm-group">
      <div className="zm-row">
        <div className="zm-row-text">
          <span className="zm-label" id="timeline-width-label">
            Timeline width
          </span>
          <p className="zm-description">Width of the center column on desktop.</p>
        </div>
        <span className="zm-value">{width} px</span>
      </div>
      <div>
        <SliderPrimitive.Root
          className="zm-slider"
          value={[width]}
          min={600}
          max={800}
          step={50}
          onValueChange={([next]) => {
            if (next) setWidth(next);
          }}
        >
          <SliderPrimitive.Track className="zm-slider-track">
            <SliderPrimitive.Range className="zm-slider-range" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb className="zm-slider-thumb" aria-labelledby="timeline-width-label" aria-valuetext={`${width} pixels`} />
        </SliderPrimitive.Root>
        <div className="zm-ticks" aria-hidden="true">
          {widths.map((tick) => (
            <span key={tick} data-current={tick === width}>
              {tick}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TimelineWidthSlider;
