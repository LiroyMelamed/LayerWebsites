import "./Skeleton.scss";

export default function Skeleton({ width, height, borderRadius, circle, className }) {
    const style = {
        width: circle ? height : (width || "100%"),
        height: height || 16,
        borderRadius: circle ? "50%" : (borderRadius || 4),
    };

    return (
        <div
            className={["lw-skeleton", className].filter(Boolean).join(" ")}
            style={style}
        />
    );
}
