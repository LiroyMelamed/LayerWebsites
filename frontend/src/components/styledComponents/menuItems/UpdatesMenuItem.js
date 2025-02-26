import { icons } from "../../../assets/icons/icons";
import SimpleButton from "../../simpleComponents/SimpleButton";
import SimpleIcon from "../../simpleComponents/SimpleIcon";
import { TextBold12, TextBold14 } from "../../specializedComponents/text/AllTextKindFile";

export default function UpdatesMenuItem({ menuItemName, onPress, style }) {

    const MenuItemStyle = {
        ...styles.menuItemStyle,
        ...style
    }

    return (
        <SimpleButton
            onPress={onPress}
            style={MenuItemStyle}
        >
            <TextBold14 style={{ flex: 1 }}>{menuItemName}</TextBold14>

            <SimpleIcon
                src={icons.Button.DownArrow}
                size={14}
                style={styles.icon}
            />
        </SimpleButton>
    );
}

const styles = {
    menuItemStyle: {
        display: 'flex',
        minHeight: '48px',
        flexDirection: 'row-reverse',
        alignItems: 'center',
    },
    icon: {
        transform: 'rotate(90deg)'
    }
}