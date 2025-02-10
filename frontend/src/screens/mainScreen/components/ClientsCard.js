import SimpleCard from "../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import { Text14, TextBold14 } from "../../../components/specializedComponents/text/AllTextKindFile";
import ClientMenuItem from "../../../components/styledComponents/menuItems/ClientMenuItem";
import Separator from "../../../components/styledComponents/separators/Separator";

export default function ClientsCard({ customerList, style }) {
    return (
        <SimpleCard style={style}>
            <SimpleContainer style={{ display: 'flex', flexDirection: 'row-reverse' }}>
                <TextBold14 style={styles.textContainer}>{'שם חברה'}</TextBold14>

                <Text14 style={styles.textContainer}>{'שם לקוח'}</Text14>

                <Text14 style={styles.textContainer}>{'מייל'}</Text14>

                <Text14 style={styles.textContainer}>{'טלפון'}</Text14>
            </SimpleContainer>

            <Separator />

            {customerList.map((customer, index) => (
                <>
                    {index !== 0 &&
                        <Separator />
                    }
                    <ClientMenuItem
                        CompanyName={customer.CompanyName}
                        clientMail={customer.CustomerMail}
                        clientName={customer.CustomerName}
                        clientPhone={customer.CustomerPhone}
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