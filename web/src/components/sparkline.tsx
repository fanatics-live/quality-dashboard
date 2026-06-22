"use client";

import { LineChart, Line, ResponsiveContainer } from "recharts";

export function Sparkline({
  data,
  color = "#6366f1",
  height = 24,
  width = 80,
}: {
  data: number[];
  color?: string;
  height?: number;
  width?: number;
}) {
  if (data.length === 0) return null;

  const points = data.map((value, i) => ({ v: value, i }));

  return (
    <ResponsiveContainer width={width} height={height}>
      <LineChart data={points}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
