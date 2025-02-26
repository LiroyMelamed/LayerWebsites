import { colors } from "../../../constant/colors";
import SimpleText from "../../simpleComponents/SimpleText";

export default function DefaultText({ controlId, children, shouldApplyClamping = false, numberOfLines, lineHeight, style, size, ...props }) {
    if (!children && children !== 0 && children !== '') {
        return null;
    }

    const textStyle = {
        ...styles.text,
        ...style,
        ...(shouldApplyClamping && {
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: numberOfLines,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: lineHeight || `${size * 1.2}px`,
            whiteSpace: 'pre-line',
            overflowWrap: 'break-word',
            wordBreak: 'break-word',
        }),
    };

    return (
        <SimpleText {...props} style={textStyle}>
            {children}
        </SimpleText>
    );
}

const styles = {
    text: {
        color: colors.text,
    }
};
