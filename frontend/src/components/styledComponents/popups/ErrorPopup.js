import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { Text14, TextBold16 } from "../../specializedComponents/text/AllTextKindFile";
import PrimaryButton from "../buttons/PrimaryButton";
import Separator from "../separators/Separator";
import { useTranslation } from "react-i18next";

import "./ErrorPopup.scss";

export default function ErrorPopup({
    closePopup,
    errorText,
    messageKey,
    messageValues,
    titleKey,
    titleValues,
    okKey,
    okValues,
}) {
    const { t } = useTranslation();

    const resolvedTitle = titleKey ? t(titleKey, titleValues) : t("errors.oopsTitle");
    const resolvedMessage = messageKey
        ? t(messageKey, messageValues)
        : (typeof errorText === "string" && errorText.trim().length > 0)
            ? errorText
            : t("errors.unexpected");
    const resolvedOk = okKey ? t(okKey, okValues) : t("common.ok");

    return (
        <SimpleContainer className="lw-errorPopup">
            <TextBold16>{resolvedTitle}</TextBold16>

            <Separator className="lw-errorPopup__separator" />

            <Text14 className="lw-errorPopup__message">{resolvedMessage}</Text14>

            <Separator className="lw-errorPopup__separator" />

            <SimpleContainer className="lw-errorPopup__actions">
                <PrimaryButton onPress={() => closePopup()}>{resolvedOk}</PrimaryButton>
            </SimpleContainer>
        </SimpleContainer>
    );
}