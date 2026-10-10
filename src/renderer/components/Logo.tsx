import React from 'react'

export interface LogoProps {
  size?: number
  className?: string
  showText?: boolean
  textColor?: string
  subtitle?: string
}

export const Logo: React.FC<LogoProps> = ({
  size = 32,
  className = '',
  showText = false,
  textColor,
  subtitle
}) => {
  // 根据图标渲染尺寸自动选取最佳光学粗细参数（保证极小尺寸与高清大尺寸均清晰锐利）
  let lStroke = 7.5
  let zStroke = 6.0
  let bottomPath =
    'M18.60 53.89L20.09 53.00L21.66 52.10L23.29 51.21L24.97 50.33L26.71 49.47L28.49 48.62L30.30 47.79L32.15 46.99L34.01 46.23L35.90 45.49L37.79 44.80L39.68 44.14L41.57 43.54L43.45 42.99L45.32 42.50L47.16 42.09L47.69 41.86L48.02 41.40L48.09 40.84L47.86 40.31L47.40 39.98L46.84 39.91L44.90 40.12L42.92 40.36L40.92 40.64L38.90 40.96L36.86 41.33L34.81 41.73L32.77 42.16L30.73 42.63L28.70 43.13L26.69 43.65L24.71 44.19L22.76 44.75L20.85 45.32L18.98 45.91L17.17 46.50L15.40 47.11Z'

  if (size <= 18) {
    lStroke = 9.8
    zStroke = 8.4
    bottomPath =
      'M19.09 54.93L20.57 54.06L22.13 53.19L23.74 52.32L25.42 51.47L27.15 50.62L28.91 49.80L30.72 49.00L32.55 48.22L34.40 47.47L36.26 46.76L38.13 46.09L40.01 45.45L41.87 44.87L43.73 44.34L45.56 43.87L47.37 43.47L48.56 42.96L49.33 41.92L49.47 40.63L48.96 39.44L47.92 38.67L46.63 38.53L44.65 38.75L42.65 39.01L40.62 39.31L38.57 39.66L36.51 40.04L34.45 40.46L32.38 40.92L30.33 41.41L28.29 41.92L26.27 42.47L24.27 43.03L22.31 43.61L20.39 44.21L18.51 44.82L16.69 45.44L14.91 46.07Z'
  } else if (size <= 26) {
    lStroke = 9.0
    zStroke = 7.6
    bottomPath =
      'M18.92 54.57L20.41 53.70L21.97 52.82L23.59 51.95L25.27 51.10L27.00 50.25L28.78 49.42L30.59 48.62L32.42 47.84L34.28 47.09L36.15 46.37L38.03 45.70L39.91 45.07L41.79 44.48L43.65 43.95L45.49 43.48L47.31 43.08L48.31 42.64L48.95 41.77L49.08 40.69L48.64 39.69L47.77 39.05L46.69 38.92L44.72 39.14L42.73 39.40L40.71 39.70L38.67 40.04L36.62 40.43L34.56 40.85L32.50 41.30L30.45 41.79L28.42 42.30L26.40 42.84L24.42 43.40L22.46 43.98L20.54 44.58L18.67 45.19L16.85 45.80L15.08 46.43Z'
  } else if (size <= 38) {
    lStroke = 8.4
    zStroke = 7.0
    bottomPath =
      'M18.79 54.30L20.28 53.42L21.85 52.55L23.48 51.68L25.16 50.82L26.90 49.97L28.68 49.14L30.49 48.33L32.33 47.55L34.19 46.80L36.07 46.09L37.95 45.41L39.84 44.77L41.72 44.19L43.59 43.65L45.44 43.18L47.27 42.78L48.12 42.41L48.68 41.66L48.78 40.73L48.41 39.88L47.66 39.32L46.73 39.22L44.78 39.44L42.79 39.70L40.77 39.99L38.74 40.33L36.69 40.72L34.64 41.13L32.59 41.59L30.55 42.07L28.52 42.59L26.51 43.12L24.52 43.68L22.57 44.26L20.66 44.86L18.79 45.46L16.97 46.08L15.21 46.70Z'
  } else if (size <= 54) {
    lStroke = 7.8
    zStroke = 6.4
    bottomPath =
      'M18.66 54.03L20.16 53.14L21.72 52.26L23.35 51.38L25.04 50.51L26.78 49.66L28.56 48.82L30.38 48.00L32.22 47.22L34.09 46.46L35.97 45.73L37.86 45.05L39.75 44.41L41.64 43.81L43.51 43.27L45.37 42.79L47.21 42.38L47.87 42.10L48.30 41.51L48.38 40.79L48.10 40.13L47.51 39.70L46.79 39.62L44.85 39.83L42.87 40.08L40.86 40.37L38.83 40.70L36.79 41.08L34.74 41.49L32.70 41.93L30.66 42.41L28.63 42.91L26.62 43.45L24.64 44.00L22.69 44.57L20.78 45.15L18.92 45.75L17.10 46.36L15.34 46.97Z'
  }

  const iconElement = (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="LZ Manager logo"
      className={`shrink-0 select-none ${className}`}
      style={{ display: 'block' }}
    >
      <rect width="64" height="64" rx="16" fill="#1F4FC4" />
      {size >= 32 && (
        <rect
          x="3"
          y="3"
          width="58"
          height="58"
          rx="13"
          fill="none"
          stroke="#FFFFFF"
          strokeOpacity="0.22"
          strokeWidth="1"
        />
      )}
      <g transform="translate(-0.75 0.5)">
        {/* L 垂直主干 */}
        <path
          d="M17 13V50.5"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={lStroke}
          strokeLinecap="round"
        />
        {/* L 底部弧面转折横划 */}
        <path d={bottomPath} fill="#FFFFFF" />
        {/* Z 冰蓝霓虹折线 */}
        <path
          d="M27.65 19.04L42.03 12.02L33.97 31.98L49.25 24.53"
          fill="none"
          stroke="#BCD0FF"
          strokeWidth={zStroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  )

  if (!showText) {
    return iconElement
  }

  return (
    <div className="flex items-center gap-2.5">
      {iconElement}
      <div className="flex flex-col">
        <span
          className={`font-title font-extrabold tracking-wider uppercase text-sm leading-tight ${
            textColor || 'text-text'
          }`}
        >
          LZ MANAGER
        </span>
        {subtitle && (
          <span className="text-[10px] font-semibold text-text-muted leading-tight">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  )
}
export default Logo
