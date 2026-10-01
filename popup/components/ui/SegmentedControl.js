import React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { defaultPreferences } from "../../../storage-keys";
import { useStorageValueState } from "../../utilities/useStorageKeyState";
import { styled } from "@stitches/react";

const StyledSegmentedControlList = styled(TabsPrimitive.List, {
  display: "flex",
  width: "100%",
  border: "1px solid #38444d",
  borderRadius: "8px",
  overflow: "hidden",
  backgroundColor: "#15202b",
});

const StyledSegmentedControlTrigger = styled(TabsPrimitive.Trigger, {
  flex: 1,
  minWidth: 0,
  padding: "6px 10px",
  fontSize: "13px",
  fontWeight: 500,
  lineHeight: "16px",
  textAlign: "center",
  whiteSpace: "nowrap",
  backgroundColor: "transparent",
  border: "none",
  cursor: "pointer",
  transition: "background-color 0.15s ease, color 0.15s ease",
  color: "#8899a6",

  "&:hover": {
    backgroundColor: "rgba(29, 155, 240, 0.10)",
    color: "#fff",
  },

  '&[data-state="active"]': {
    backgroundColor: "#1d9bf0",
    color: "#fff",
    fontWeight: 700,
  },
});

const StyledSegmentedControlRoot = styled(TabsPrimitive.Root, {
  width: "100%",
  borderRadius: "8px",
  overflow: "hidden",
});

export const SegmentedControlList = ({ segments, disabled = false }) => (
  <StyledSegmentedControlList>
    {segments.map((segment) => (
      <SegmentedControlTrigger key={segment.value} value={segment.value} label={segment.label} disabled={disabled} />
    ))}
  </StyledSegmentedControlList>
);

export const SegmentedControlTrigger = ({ value, label, disabled = false }) => <StyledSegmentedControlTrigger value={value} disabled={disabled}>{label}</StyledSegmentedControlTrigger>;

export const SegmentedControl = ({ segments = [], storageKey }) => {
  const [storedValue, setValue, loaded] = useStorageValueState(storageKey);

  if (segments.length === 0) {
    return null;
  }
  const fallback = defaultPreferences[storageKey] ?? segments[0].value;
  const value = segments.some((segment) => segment.value === storedValue) ? storedValue : segments.some((segment) => segment.value === fallback) ? fallback : segments[0].value;

  return (
    <StyledSegmentedControlRoot value={value} onValueChange={setValue}>
      <SegmentedControlList segments={segments} disabled={!loaded} />
    </StyledSegmentedControlRoot>
  );
};
