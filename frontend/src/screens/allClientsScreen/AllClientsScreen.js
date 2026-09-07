import { useMemo, useState } from "react";
import { customersApi } from "../../api/customersApi";
import { images } from "../../assets/images/images";
import TopToolBarSmallScreen from "../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import FilterSearchInput from "../../components/specializedComponents/containers/FilterSearchInput";
import useAutoHttpRequest from "../../hooks/useAutoHttpRequest";
import { AdminStackName } from "../../navigation/AdminStack";
import { useScreenSize } from "../../providers/ScreenSizeProvider";
import { MainScreenName } from "../mainScreen/MainScreen";
import ClientsCard from "../mainScreen/components/ClientsCard";
import ClientPopup from "../mainScreen/components/ClientPopUp";
import ImportClientsModal from "../mainScreen/components/ImportClientsModal";
import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../../components/styledComponents/buttons/SecondaryButton";
import { usePopup } from "../../providers/PopUpProvider";
import { useTranslation } from "react-i18next";


import "./AllClientsScreen.scss";

export const AllClientsScreenName = "/AllClientsScreen";

export default function AllClientsScreen() {
    const { t } = useTranslation();
    const { isSmallScreen } = useScreenSize();
    const [selectedName, setSelectedName] = useState(null);
    const [selectedCompany, setSelectedCompany] = useState(null);
    const [selectedPhone, setSelectedPhone] = useState(null);

    const { result: rawCustomers, isPerforming, performRequest: reperformAfterSave } = useAutoHttpRequest(customersApi.getAllCustomers);
    const { openPopup, closePopup } = usePopup();

    const allCustomers = useMemo(() => (rawCustomers || []).map(c => ({
        userid: c.UserId ?? c.userid,
        name: c.Name ?? c.name,
        email: c.Email ?? c.email,
        phonenumber: c.PhoneNumber ?? c.phonenumber,
        companyname: c.CompanyName ?? c.companyname,
        createdat: c.CreatedAt ?? c.createdat,
        dateofbirth: c.DateOfBirth ?? c.dateofbirth,
        profilepicurl: c.ProfilePicUrl ?? c.profilepicurl,
        role: c.Role ?? c.role,
    })), [rawCustomers]);

    const displayList = useMemo(() => {
        let filtered = allCustomers;

        if (selectedName) {
            const q = selectedName.toLowerCase();
            filtered = filtered.filter(c => c.name && c.name.toLowerCase().includes(q));
        }

        if (selectedCompany) {
            const q = selectedCompany.toLowerCase();
            filtered = filtered.filter(c => c.companyname && c.companyname.toLowerCase().includes(q));
        }

        if (selectedPhone) {
            filtered = filtered.filter(c => c.phonenumber && c.phonenumber.includes(selectedPhone));
        }

        return filtered;
    }, [allCustomers, selectedName, selectedCompany, selectedPhone]);

    const customerNames = [...new Set((allCustomers || []).map(c => c.name).filter(Boolean))].sort();
    const companyNames = [...new Set((allCustomers || []).map(c => c.companyname).filter(Boolean))].sort();
    const phoneNumbers = [...new Set((allCustomers || []).map(c => c.phonenumber).filter(Boolean))].sort();

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && <TopToolBarSmallScreen chosenNavKey="allClients" LogoNavigate={AdminStackName + MainScreenName} />}

            <SimpleScrollView>
                <SimpleContainer className="lw-allClientsScreen__topRow">
                    <FilterSearchInput
                        items={customerNames}
                        placeholder={t('cases.customerName')}
                        titleFontSize={20}
                        onSelect={setSelectedName}
                        className="lw-allClientsScreen__search"
                    />

                    <FilterSearchInput
                        items={companyNames}
                        placeholder={t('customers.companyName')}
                        titleFontSize={20}
                        onSelect={setSelectedCompany}
                        className="lw-allClientsScreen__search"
                    />

                    <FilterSearchInput
                        items={phoneNumbers}
                        placeholder={t('customers.customerPhone')}
                        titleFontSize={20}
                        onSelect={setSelectedPhone}
                        className="lw-allClientsScreen__search"
                    />
                </SimpleContainer>

                <ClientsCard
                    customerList={displayList}
                    rePerformRequest={reperformAfterSave}
                    isPerforming={isPerforming}
                    hideButtons
                />
            </SimpleScrollView>

            <SimpleContainer className="lw-allClientsScreen__footer">
                <PrimaryButton
                    onPress={() => openPopup(<ClientPopup closePopUpFunction={closePopup} rePerformRequest={reperformAfterSave} />)}
                >
                    {t("customers.addCustomer")}
                </PrimaryButton>

                <SecondaryButton
                    onPress={() => openPopup(<ImportClientsModal closePopUpFunction={closePopup} rePerformRequest={reperformAfterSave} />)}
                >
                    {t("clientImport.button")}
                </SecondaryButton>
            </SimpleContainer>
        </SimpleScreen>
    );
}
