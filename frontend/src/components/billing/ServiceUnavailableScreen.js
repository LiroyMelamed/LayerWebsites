import React from 'react';
import SimpleScreen from '../simpleComponents/SimpleScreen';
import SimpleCard from '../simpleComponents/SimpleCard';
import SimpleButton from '../simpleComponents/SimpleButton';
import { Text14, TextBold24 } from '../specializedComponents/text/AllTextKindFile';
import { images } from '../../assets/images/images';
import './BillingLockedScreen.scss';
export default function ServiceUnavailableScreen() {
    return <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}><SimpleCard className="lw-billingLockedScreen__card"><TextBold24>השירות אינו זמין כרגע</TextBold24><Text14 className="lw-billingLockedScreen__body">עקב תקלה זמנית, לא ניתן לגשת למערכת כרגע. נסו שוב מאוחר יותר.</Text14><SimpleButton className="lw-billingLockedScreen__button" onPress={() => window.location.reload()}><Text14>ניסיון נוסף</Text14></SimpleButton></SimpleCard></SimpleScreen>;
}
