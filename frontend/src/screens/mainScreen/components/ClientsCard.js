import { images } from "../../../assets/images/images";
import SimpleCard from "../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleImage from "../../../components/simpleComponents/SimpleImage";
import SimpleScrollView from "../../../components/simpleComponents/SimpleScrollView";
import { Text14, TextBold14 } from "../../../components/specializedComponents/text/AllTextKindFile";
import PrimaryButton from "../../../components/styledComponents/buttons/PrimaryButton";
import DefaultState from "../../../components/styledComponents/defaultState/DefaultState";
import ClientMenuItem from "../../../components/styledComponents/menuItems/ClientMenuItem";
import Separator from "../../../components/styledComponents/separators/Separator";
import { usePopup } from "../../../providers/PopUpProvider";
import ClientPopup from "./ClientPopUp";

export default function ClientsCard({ rePerformRequest, customerList, style }) {
    const { openPopup, closePopup } = usePopup();

    if (customerList?.length === 0 || !customerList) {
        return (
            <DefaultState
                content={"כשנוסיף לקוחות הם יוצגו פה"}
                imageStyle={{ height: 156 }}
                imageSrc={images.Defaults.SearchingClient}
                style={{ justifyContent: 'space-evenly' }}
                actionButton={'הוסף לקוח'}
                actionButtonPressFunction={() => openPopup(<ClientPopup closePopUpFunction={closePopup} rePerformRequest={rePerformRequest} />)}
            />
        )
    }

    return (
        <SimpleCard style={{ overflow: null, flexDirection: 'column' }}>
            <SimpleContainer style={{ display: 'flex', flexDirection: 'row-reverse' }}>
                <TextBold14 style={styles.textContainer}>{'שם חברה'}</TextBold14>

                <Text14 style={styles.textContainer}>{'שם לקוח'}</Text14>

                <Text14 style={styles.textContainer}>{'מייל'}</Text14>

                <Text14 style={styles.textContainer}>{'טלפון'}</Text14>
            </SimpleContainer>

            <Separator />

            <SimpleScrollView style={{ flex: 1 }}>
                {customerList?.map((customer, index) => (
                    <SimpleContainer style={{ flexDirection: 'column' }}>
                        {index !== 0 &&
                            <Separator />
                        }
                        <ClientMenuItem
                            clientDetails={customer}
                            CompanyName={customer.CompanyName}
                            clientMail={customer.Email}
                            clientName={customer.Name}
                            clientPhone={customer.PhoneNumber}
                        />
                    </SimpleContainer>

                ))}
            </SimpleScrollView>

            <PrimaryButton style={{ alignSelf: 'center', marginTop: '20px' }} onPress={() => openPopup(<ClientPopup closePopUpFunction={closePopup} rePerformRequest={rePerformRequest} />)}>
                הוסף לקוח
            </PrimaryButton>
        </SimpleCard>
    );
}

const styles = {
    textContainer: {
        flex: 1,
        alignText: 'right',
        margin: '0px 6px',
    }
};