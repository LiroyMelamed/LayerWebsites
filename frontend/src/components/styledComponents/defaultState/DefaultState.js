import { images } from "../../../assets/images/images";
import SimpleCard from "../../simpleComponents/SimpleCard";
import SimpleImage from "../../simpleComponents/SimpleImage";
import { TextBold14 } from "../../specializedComponents/text/AllTextKindFile";
import PrimaryButton from "../buttons/PrimaryButton";

import './DefaultState.scss';

export default function DefaultState({
    imageSrc = images.MainPage.DataFlowing,
    imageStyle,
    imageClassName,
    content,
    actionButton,
    actionButtonPressFunction,
    actionButtonLeftIcon,
    actionButtonRightIcon,
    actionButtonSize,
    style,
    className,
    contentClassName,
    actionButtonClassName,
}) {

    const resolvedCardClassName = ['lw-defaultState', className].filter(Boolean).join(' ');
    const resolvedImageClassName = ['lw-defaultState__image', imageClassName].filter(Boolean).join(' ');

    return (
        <SimpleCard className={resolvedCardClassName} style={style}>
            <SimpleImage className={resolvedImageClassName} src={imageSrc} style={imageStyle} />
            <div className={['lw-defaultState__content', contentClassName].filter(Boolean).join(' ')}>
                <TextBold14>
                    {content}
                </TextBold14>
            </div>

            {actionButton &&
                <div className={['lw-defaultState__action', actionButtonClassName].filter(Boolean).join(' ')}>
                    <PrimaryButton
                        onPress={actionButtonPressFunction}
                        rightIcon={actionButtonRightIcon}
                        leftIcon={actionButtonLeftIcon}
                        size={actionButtonSize}
                    >
                        {actionButton}
                    </PrimaryButton>
                </div>
            }
        </SimpleCard>
    );
};
