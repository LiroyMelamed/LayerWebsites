import { images } from "../../../assets/images/images";
import SimpleCard from "../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleImage from "../../../components/simpleComponents/SimpleImage";
import { Text14, TextBold14 } from "../../../components/specializedComponents/text/AllTextKindFile";
import DefaultState from "../../../components/styledComponents/defaultState/DefaultState";
import ClientMenuItem from "../../../components/styledComponents/menuItems/ClientMenuItem";
import Separator from "../../../components/styledComponents/separators/Separator";

export default function ClientsCard({ customerList, style }) {

    if (customerList?.length === 0 || !customerList) {
        return (
            <DefaultState
                content={"כשנוסיף לקוחות הם יוצגו פה"}
                imageStyle={{ height: 156 }}
                imageSrc={images.Defaults.SearchingClient}
                style={{ justifyContent: 'space-evenly' }}
            />
        )
    }

    return (
        <SimpleCard style={{ ...style, flexDirection: 'column' }}>
            <SimpleContainer style={{ display: 'flex', flexDirection: 'row-reverse' }}>
                <TextBold14 style={styles.textContainer}>{'שם חברה'}</TextBold14>

                <Text14 style={styles.textContainer}>{'שם לקוח'}</Text14>

                <Text14 style={styles.textContainer}>{'מייל'}</Text14>

                <Text14 style={styles.textContainer}>{'טלפון'}</Text14>
            </SimpleContainer>

            <Separator />

            {customerList?.map((customer, index) => (
                <>
                    {index !== 0 &&
                        <Separator />
                    }
                    <ClientMenuItem
                        CompanyName={customer.CompanyName}
                        clientMail={customer.Email}
                        clientName={customer.Name}
                        clientPhone={customer.PhoneNumber}
                    />
                </>

            ))}
        </SimpleCard>
    );
}

const styles = {
    textContainer: {
        flex: 1
    }
};