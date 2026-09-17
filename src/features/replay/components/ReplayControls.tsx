"use client";

import { Pause, Play, SkipBack, SkipForward } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { Candle } from "@/types/market.types";

import { isAtEnd, isAtStart } from "../engine/cursor";
import { useReplayStore } from "../store";

const SPEED_OPTIONS = [1, 2, 4, 8] as const;

type ReplayControlsProps = {
  candles: Candle[];
};

/**
 * Playback controls — step back / play-pause / step forward / speed.
 * `candles` is passed in rather than read from the store (ADR-005: the
 * store holds only the cursor/isPlaying/speed, never a copy of server
 * data), since every cursor-moving action needs the array to know where
 * "start"/"end" are.
 */
export function ReplayControls({ candles }: ReplayControlsProps) {
  const cursor = useReplayStore((state) => state.cursor);
  const isPlaying = useReplayStore((state) => state.isPlaying);
  const speed = useReplayStore((state) => state.speed);
  const stepForward = useReplayStore((state) => state.stepForward);
  const stepBackward = useReplayStore((state) => state.stepBackward);
  const play = useReplayStore((state) => state.play);
  const pause = useReplayStore((state) => state.pause);
  const setSpeed = useReplayStore((state) => state.setSpeed);

  const hasCandles = candles.length > 0;
  const atStart = isAtStart(candles, cursor);
  const atEnd = isAtEnd(candles, cursor);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Step back one bar"
          disabled={!hasCandles || atStart}
          onClick={() => stepBackward(candles, 1)}
        >
          <SkipBack aria-hidden="true" />
        </Button>

        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={isPlaying ? "Pause" : "Play"}
          disabled={!hasCandles || atEnd}
          onClick={() => (isPlaying ? pause() : play())}
        >
          {isPlaying ? (
            <Pause aria-hidden="true" />
          ) : (
            <Play aria-hidden="true" />
          )}
        </Button>

        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Step forward one bar"
          disabled={!hasCandles || atEnd}
          onClick={() => stepForward(candles, 1)}
        >
          <SkipForward aria-hidden="true" />
        </Button>
      </div>

      <div className="flex items-center gap-1.5">
        <Label htmlFor="replay-speed">Speed</Label>
        <Select
          id="replay-speed"
          value={speed}
          disabled={!hasCandles}
          onChange={(event) => setSpeed(Number(event.target.value))}
        >
          {SPEED_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}×
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
