import { forwardRef } from "react";
import { images } from "../../../assets/images/images";
import SimpleCard from "../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
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

const ClientsCard = forwardRef(({ rePerformRequest, customerList, style: _style }, ref) => {
    const { openPopup, closePopup } = usePopup();
    const { t } = useTranslation();

    if (customerList?.length === 0 || !customerList) {
        return (
            <SimpleCard className="lw-clientsCard__empty--wrap">
                <DefaultState
                    content={t("customers.emptyList")}
                    imageStyle={{ height: 156 }}
                    imageSrc={images.Defaults.SearchingClient}
                    className="lw-clientsCard__empty"
                    imageClassName="lw-clientsCard__emptyImage"
                    actionButton={t("customers.addCustomer")}
                    actionButtonPressFunction={() => openPopup(<ClientPopup closePopUpFunction={closePopup} rePerformRequest={rePerformRequest} />)}
                />
            </SimpleCard>
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
        </SimpleCard>
    );
});

export default ClientsCard;
