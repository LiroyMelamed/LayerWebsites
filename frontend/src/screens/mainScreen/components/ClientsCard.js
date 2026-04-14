import { forwardRef } from "react";
import { images } from "../../../assets/images/images";
import SimpleCard from "../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import Skeleton from "../../../components/simpleComponents/Skeleton";
import SimpleScrollView from "../../../components/simpleComponents/SimpleScrollView";
import { Text14, TextBold14 } from "../../../components/specializedComponents/text/AllTextKindFile";
import PrimaryButton from "../../../components/styledComponents/buttons/PrimaryButton";
import DefaultState from "../../../components/styledComponents/defaultState/DefaultState";
import ClientMenuItem from "../../../components/styledComponents/menuItems/ClientMenuItem";
import Separator from "../../../components/styledComponents/separators/Separator";
import { usePopup } from "../../../providers/PopUpProvider";
import ClientPopup from "./ClientPopUp";
import ImportClientsModal from "./ImportClientsModal";
import { useTranslation } from "react-i18next";

import "./ClientsCard.scss";
import SecondaryButton from "../../../components/styledComponents/buttons/SecondaryButton";

const ClientsCard = forwardRef(({ rePerformRequest, customerList, style: _style, isPerforming, hideButtons }, ref) => {
    const { openPopup, closePopup } = usePopup();
    const { t } = useTranslation();

    if (isPerforming) {
        return (
            <SimpleCard className="lw-clientsCard" ref={ref}>
                <SimpleContainer className="lw-clientsCard__headerRow">
                    <Skeleton width="25%" height={14} />
                    <Skeleton width="25%" height={14} />
                    <Skeleton width="25%" height={14} />
                    <Skeleton width="15%" height={14} />
                </SimpleContainer>
                <Separator />
                {[1, 2, 3, 4].map(i => (
                    <SimpleContainer key={i} style={{ padding: '12px 0' }}>
                        {i !== 1 && <Separator />}
                        <SimpleContainer style={{ display: 'flex', gap: 16, padding: '8px 0' }}>
                            <Skeleton width="25%" height={14} />
                            <Skeleton width="25%" height={14} />
                            <Skeleton width="25%" height={14} />
                            <Skeleton width="15%" height={14} />
                        </SimpleContainer>
                    </SimpleContainer>
                ))}
            </SimpleCard>
        );
    }

    if (customerList?.length === 0 || !customerList) {
        return (
            <DefaultState
                content={t("customers.emptyList")}
                imageStyle={{ height: 156 }}
                imageSrc={images.Defaults.SearchingClient}
                className="lw-clientsCard__empty"
                imageClassName="lw-clientsCard__emptyImage"
                actionButton={t("customers.addCustomer")}
                actionButtonPressFunction={() => openPopup(<ClientPopup closePopUpFunction={closePopup} rePerformRequest={rePerformRequest} />)}
            />
        )
    }

    return (
        <SimpleCard className="lw-clientsCard" ref={ref} style={_style}>
            <SimpleContainer className="lw-clientsCard__headerRow">
                <TextBold14 className="lw-clientsCard__headerCell">{t("customers.companyName")}</TextBold14>

                <Text14 className="lw-clientsCard__headerCell">{t("cases.customerName")}</Text14>

                <Text14 className="lw-clientsCard__headerCell lw-clientsCard__headerCell--email">{t("common.email")}</Text14>

                <Text14 className="lw-clientsCard__headerCell lw-clientsCard__headerCell--phone">{t("cases.phoneNumber")}</Text14>
            </SimpleContainer>

            <Separator />

            <SimpleScrollView className="lw-clientsCard__list">
                {customerList?.map((customer, index) => (
                    <SimpleContainer className="lw-clientsCard__listItem" key={customer?.userid ?? index}>
                        {index !== 0 &&
                            <Separator />
                        }
                        <ClientMenuItem
                            clientDetails={customer}
                            CompanyName={customer.companyname}
                            clientMail={customer.email}
                            clientName={customer.name}
                            clientPhone={customer.phonenumber}
                            closePopUpFunction={closePopup}
                            rePerformRequest={rePerformRequest}
                        />
                    </SimpleContainer>

                ))}
            </SimpleScrollView>

            {!hideButtons && (
                <SimpleContainer className="lw-clientsCard__buttonsRow">
                    <PrimaryButton
                        onPress={() => openPopup(<ClientPopup closePopUpFunction={closePopup} rePerformRequest={rePerformRequest} />)}
                    >
                        {t("customers.addCustomer")}
                    </PrimaryButton>

                    <SecondaryButton
                        onPress={() => openPopup(<ImportClientsModal closePopUpFunction={closePopup} rePerformRequest={rePerformRequest} />)}
                    >
                        {t("clientImport.button")}
                    </SecondaryButton>
                </SimpleContainer>
            )}
        </SimpleCard>
    );
});

export default ClientsCard;
