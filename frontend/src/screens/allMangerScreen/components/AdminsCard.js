import { images } from "../../../assets/images/images";
import { useTranslation } from "react-i18next";
import SimpleCard from "../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import Skeleton from "../../../components/simpleComponents/Skeleton";
import { Text14, TextBold14 } from "../../../components/specializedComponents/text/AllTextKindFile";
import ListPageTitle from "../../../components/specializedComponents/text/ListPageTitle";
import DefaultState from "../../../components/styledComponents/defaultState/DefaultState";
import AdminMenuItem from "../../../components/styledComponents/menuItems/AdminMenuItem";
import Separator from "../../../components/styledComponents/separators/Separator";

import "./AdminsCard.scss";

function officeUserTypeLabel(role, t) {
    if (role === "Lawyer") return t("admins.userTypeLawyer", "עורך דין");
    if (role === "Admin") return t("admins.userTypeAdmin", "מנהל");
    return role || "—";
}

function customRoleLabel(user, t) {
    if (user?.is_platform_admin || user?.isPlatformAdmin) {
        return t("admins.platformOwner", "בעל מערכת");
    }
    return user?.firm_staff_role_name || user?.firmStaffRoleName || t("admins.firmStaffRoleNoneShort", "ללא");
}

export default function AdminsCard({
    adminList,
    isPerforming,
    performGetAdmins,
    showOfficeUserColumns = false,
    style: _style,
}) {
    const { t } = useTranslation();
    const pageTitle = showOfficeUserColumns
        ? t("admins.officeUsersTitle", "משתמשי משרד")
        : t("nav.allManagers");

    if (isPerforming) {
        return (
            <SimpleCard className="lw-adminsCard lw-adminsCard--loading">
                <SimpleContainer className="lw-adminsCard__headerRow">
                    <Skeleton width="25%" height={14} />
                    <Skeleton width="20%" height={14} />
                    <Skeleton width="25%" height={14} />
                    <Skeleton width="15%" height={14} />
                </SimpleContainer>
                <Separator />
                {[1, 2, 3].map((i) => (
                    <SimpleContainer key={i} style={{ padding: "0.75rem 0" }}>
                        {i !== 1 && <Separator />}
                        <SimpleContainer style={{ display: "flex", gap: "1rem", padding: "0.5rem 0" }}>
                            <Skeleton width="25%" height={14} />
                            <Skeleton width="20%" height={14} />
                            <Skeleton width="25%" height={14} />
                            <Skeleton width="15%" height={14} />
                        </SimpleContainer>
                    </SimpleContainer>
                ))}
            </SimpleCard>
        );
    }

    if (adminList?.length === 0 || !adminList) {
        return (
            <SimpleCard className="lw-adminsCard lw-adminsCard__empty">
                <ListPageTitle title={pageTitle} count={0} className="lw-adminsCard__pageTitle" />
                <DefaultState
                    content={t("admins.emptyList")}
                    imageStyle={{ height: 156 }}
                    imageSrc={images.Defaults.Managers}
                    className="lw-adminsCard__empty"
                    imageClassName="lw-adminsCard__emptyImage"
                />
            </SimpleCard>
        );
    }

    return (
        <SimpleCard className="lw-adminsCard">
            <ListPageTitle title={pageTitle} count={adminList?.length ?? 0} className="lw-adminsCard__pageTitle" />
            <SimpleContainer className="lw-adminsCard__headerRow">
                <TextBold14 className="lw-adminsCard__headerCell">{t("admins.adminName")}</TextBold14>
                {showOfficeUserColumns ? (
                    <>
                        <Text14 className="lw-adminsCard__headerCell">{t("admins.userType", "סוג משתמש")}</Text14>
                        <Text14 className="lw-adminsCard__headerCell">
                            {t("admins.firmStaffRoleSection", "תפקיד והרשאות")}
                        </Text14>
                    </>
                ) : (
                    <Text14 className="lw-adminsCard__headerCell">{t("admins.createdAt")}</Text14>
                )}
                <Text14 className="lw-adminsCard__headerCell lw-adminsCard__headerCell--email">
                    {t("common.email")}
                </Text14>
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
                        userTypeLabel={
                            showOfficeUserColumns ? officeUserTypeLabel(customer.role, t) : null
                        }
                        customRoleLabel={
                            showOfficeUserColumns ? customRoleLabel(customer, t) : null
                        }
                        performGetAdmins={performGetAdmins}
                    />
                </>
            ))}
        </SimpleCard>
    );
}
