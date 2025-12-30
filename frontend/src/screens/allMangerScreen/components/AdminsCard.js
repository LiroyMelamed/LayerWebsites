import { images } from "../../../assets/images/images";
import SimpleCard from "../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleLoader from "../../../components/simpleComponents/SimpleLoader";
import { Text14, TextBold14 } from "../../../components/specializedComponents/text/AllTextKindFile";
import DefaultState from "../../../components/styledComponents/defaultState/DefaultState";
import AdminMenuItem from "../../../components/styledComponents/menuItems/AdminMenuItem";
import Separator from "../../../components/styledComponents/separators/Separator";

import "./AdminsCard.scss";


export default function AdminsCard({ adminList, isPerforming, performGetAdmins, style }) {

    if (isPerforming) {
        return (
            <SimpleCard className="lw-adminsCard lw-adminsCard--loading">
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
                className="lw-adminsCard__empty"
                imageClassName="lw-adminsCard__emptyImage"
            />
        )
    }

    return (
        <SimpleCard className="lw-adminsCard" style={style}>
            <SimpleContainer className="lw-adminsCard__headerRow">
                <TextBold14 className="lw-adminsCard__headerCell">{'שם המנהל'}</TextBold14>

                <Text14 className="lw-adminsCard__headerCell">{'נוצר בתאריך'}</Text14>

                <Text14 className="lw-adminsCard__headerCell lw-adminsCard__headerCell--email">{'מייל'}</Text14>

                <Text14 className="lw-adminsCard__headerCell">{'טלפון'}</Text14>
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
