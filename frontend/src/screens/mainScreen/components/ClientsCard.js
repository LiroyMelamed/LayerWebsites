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

import "./ClientsCard.scss";

export default function ClientsCard({ rePerformRequest, customerList, style: _style }) {
    const { openPopup, closePopup } = usePopup();

    if (customerList?.length === 0 || !customerList) {
        return (
            <DefaultState
                content={"כשנוסיף לקוחות הם יוצגו פה"}
                imageStyle={{ height: 156 }}
                imageSrc={images.Defaults.SearchingClient}
                className="lw-clientsCard__empty"
                imageClassName="lw-clientsCard__emptyImage"
                actionButton={'הוסף לקוח'}
                actionButtonPressFunction={() => openPopup(<ClientPopup closePopUpFunction={closePopup} rePerformRequest={rePerformRequest} />)}
            />
        )
    }

    return (
        <SimpleCard className="lw-clientsCard">
            <SimpleContainer className="lw-clientsCard__headerRow">
                <TextBold14 className="lw-clientsCard__headerCell">{'שם חברה'}</TextBold14>

                <Text14 className="lw-clientsCard__headerCell">{'שם לקוח'}</Text14>

                <Text14 className="lw-clientsCard__headerCell lw-clientsCard__headerCell--email">{'מייל'}</Text14>

                <Text14 className="lw-clientsCard__headerCell">{'טלפון'}</Text14>
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

            <PrimaryButton
                className="lw-clientsCard__addButton"
                onPress={() => openPopup(<ClientPopup closePopUpFunction={closePopup} rePerformRequest={rePerformRequest} />)}
            >
                הוסף לקוח
            </PrimaryButton>
        </SimpleCard>
    );
}
