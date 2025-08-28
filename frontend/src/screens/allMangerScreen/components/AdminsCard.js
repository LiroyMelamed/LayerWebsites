import { images } from "../../../assets/images/images";
import SimpleCard from "../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleLoader from "../../../components/simpleComponents/SimpleLoader";
import { Text14, TextBold14 } from "../../../components/specializedComponents/text/AllTextKindFile";
import DefaultState from "../../../components/styledComponents/defaultState/DefaultState";
import AdminMenuItem from "../../../components/styledComponents/menuItems/AdminMenuItem";
import Separator from "../../../components/styledComponents/separators/Separator";


export default function AdminsCard({ adminList, isPerforming, performGetAdmins, style }) {

    if (isPerforming) {
        return (
            <SimpleCard style={{ overflow: null, flexDirection: 'column' }}>
                <SimpleLoader />
            </SimpleCard>
        )
    }

    if (adminList?.length === 0 || !adminList) {
        return (
            <DefaultState
                content={"כשנוסיף מנהלים הם יוצגו פה"}
                imageStyle={{ height: 156 }}
                imageSrc={images.Defaults.Managers}
                style={{ width: null }}
            />
        )
    }

    return (
        <SimpleCard style={{ ...style, flexDirection: 'column' }}>
            <SimpleContainer style={{ display: 'flex', flexDirection: 'row-reverse' }}>
                <TextBold14 style={styles.textContainer}>{'שם המנהל'}</TextBold14>

                <Text14 style={styles.textContainer}>{'נוצר בתאריך'}</Text14>

                <Text14 style={styles.textContainer}>{'מייל'}</Text14>

                <Text14 style={styles.textContainer}>{'טלפון'}</Text14>
            </SimpleContainer>

            <Separator />

            {adminList?.map((customer, index) => (
                <>
                    {index !== 0 &&
                        <Separator />
                    }
                    <AdminMenuItem
                        admin={customer}
                        adminName={customer.name}
                        CreatedAt={customer.createdat}
                        adminMail={customer.email}
                        adminPhone={customer.phonenumber}
                        performGetAdmins={performGetAdmins}
                    />
                </>

            ))}
        </SimpleCard>
    );
}

const styles = {
    textContainer: {
        flex: 1,
        textAlign: 'right',
        margin: '0px 6px',
    }
};