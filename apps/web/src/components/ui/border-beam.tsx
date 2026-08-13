import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

export interface BorderBeamProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  active?: boolean;
  duration?: number;
  borderRadius?: number;
}

export function BorderBeam({
  children,
  active = true,
  duration = 2.2,
  borderRadius = 24,
  className,
  style,
  ...props
}: BorderBeamProps) {
  const beamStyle = {
    "--border-beam-duration": `${duration}s`,
    "--border-beam-radius": `${borderRadius}px`,
    ...style,
  } as CSSProperties;

  return (
    <div
      {...props}
      className={`border-beam ${className ?? ""}`.trim()}
      data-border-beam-active={active}
      style={beamStyle}
    >
      {children}
    </div>
  );
}

export default BorderBeam;
