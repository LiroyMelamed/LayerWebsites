import { colors } from "../../../constant/colors";
import { TextBold12 } from "../../specializedComponents/text/AllTextKindFile";

export default function ErrorText({ children }) {
    return (
        <TextBold12 color={colors.error}>{children}</TextBold12>
    );
}