import { images } from "../../../assets/images/images";
import { useTranslation } from "react-i18next";
import SimpleCard from "../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleLoader from "../../../components/simpleComponents/SimpleLoader";
import { Text14, TextBold14 } from "../../../components/specializedComponents/text/AllTextKindFile";
import DefaultState from "../../../components/styledComponents/defaultState/DefaultState";
import AdminMenuItem from "../../../components/styledComponents/menuItems/AdminMenuItem";
import Separator from "../../../components/styledComponents/separators/Separator";

import "./AdminsCard.scss";


export default function AdminsCard({ adminList, isPerforming, performGetAdmins, style: _style }) {
    const { t } = useTranslation();

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
                content={t("admins.emptyList")}
                imageStyle={{ height: 156 }}
                imageSrc={images.Defaults.Managers}
                className="lw-adminsCard__empty"
                imageClassName="lw-adminsCard__emptyImage"
            />
        )
    }

    return (
        <SimpleCard className="lw-adminsCard">
            <SimpleContainer className="lw-adminsCard__headerRow">
                <TextBold14 className="lw-adminsCard__headerCell">{t("admins.adminName")}</TextBold14>

                <Text14 className="lw-adminsCard__headerCell">{t("admins.createdAt")}</Text14>

                <Text14 className="lw-adminsCard__headerCell lw-adminsCard__headerCell--email">{t("common.email")}</Text14>

                <Text14 className="lw-adminsCard__headerCell">{t("cases.phoneNumber")}</Text14>
            </SimpleContainer>

            <Separator />

            {adminList?.map((customer, index) => (
                <>
                    {index !== 0 && <Separator />}
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
