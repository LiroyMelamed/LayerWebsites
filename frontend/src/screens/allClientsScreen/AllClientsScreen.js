import { useState } from "react";
import { customersApi } from "../../api/customersApi";
import { images } from "../../assets/images/images";
import TopToolBarSmallScreen from "../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import FilterSearchInput from "../../components/specializedComponents/containers/FilterSearchInput";
import DefaultState from "../../components/styledComponents/defaultState/DefaultState";
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
    const [filteredClients, setFilteredClients] = useState(null);

    const { result: rawCustomers, isPerforming, performRequest: reperformAfterSave } = useAutoHttpRequest(customersApi.getAllCustomers);
    const { openPopup, closePopup } = usePopup();

    const allCustomers = (rawCustomers || []).map(c => ({
        userid: c.UserId ?? c.userid,
        name: c.Name ?? c.name,
        email: c.Email ?? c.email,
        phonenumber: c.PhoneNumber ?? c.phonenumber,
        companyname: c.CompanyName ?? c.companyname,
        createdat: c.CreatedAt ?? c.createdat,
        dateofbirth: c.DateOfBirth ?? c.dateofbirth,
        profilepicurl: c.ProfilePicUrl ?? c.profilepicurl,
        role: c.Role ?? c.role,
    }));

    const applyFilters = (nameFilter, companyFilter, phoneFilter) => {
        let filtered = allCustomers;

        if (nameFilter) {
            const q = nameFilter.toLowerCase();
            filtered = filtered.filter(c => c.name && c.name.toLowerCase().includes(q));
        }

        if (companyFilter) {
            const q = companyFilter.toLowerCase();
            filtered = filtered.filter(c => c.companyname && c.companyname.toLowerCase().includes(q));
        }

        if (phoneFilter) {
            filtered = filtered.filter(c => c.phonenumber && c.phonenumber.includes(phoneFilter));
        }

        if (!nameFilter && !companyFilter && !phoneFilter) {
            setFilteredClients(null);
        } else {
            setFilteredClients(filtered);
        }
    };

    const handleFilterByName = (name) => {
        setSelectedName(name);
        applyFilters(name, selectedCompany, selectedPhone);
    };

    const handleFilterByCompany = (company) => {
        setSelectedCompany(company);
        applyFilters(selectedName, company, selectedPhone);
    };

    const handleFilterByPhone = (phone) => {
        setSelectedPhone(phone);
        applyFilters(selectedName, selectedCompany, phone);
    };

    const customerNames = [...new Set((allCustomers || []).map(c => c.name).filter(Boolean))].sort();
    const companyNames = [...new Set((allCustomers || []).map(c => c.companyname).filter(Boolean))].sort();
    const phoneNumbers = [...new Set((allCustomers || []).map(c => c.phonenumber).filter(Boolean))].sort();

    const displayList = filteredClients || allCustomers;

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && <TopToolBarSmallScreen chosenNavKey="allClients" LogoNavigate={AdminStackName + MainScreenName} />}

            <SimpleScrollView>
                <SimpleContainer className="lw-allClientsScreen__topRow">
                    <FilterSearchInput
                        items={customerNames}
                        placeholder={t('cases.customerName')}
                        titleFontSize={20}
                        onSelect={handleFilterByName}
                        className="lw-allClientsScreen__search"
                    />

                    <FilterSearchInput
                        items={companyNames}
                        placeholder={t('customers.companyName')}
                        titleFontSize={20}
                        onSelect={handleFilterByCompany}
                        className="lw-allClientsScreen__search"
                    />

                    <FilterSearchInput
                        items={phoneNumbers}
                        placeholder={t('customers.customerPhone')}
                        titleFontSize={20}
                        onSelect={handleFilterByPhone}
                        className="lw-allClientsScreen__search"
                    />
                </SimpleContainer>

                {(!isPerforming && (!displayList || displayList.length === 0)) ? (
                    <DefaultState
                        content={t("customers.emptyList")}
                        imageClassName="lw-defaultState__image--h156"
                        imageSrc={images.Defaults.SearchingClient}
                    />
                ) : (
                    <ClientsCard
                        customerList={displayList}
                        rePerformRequest={reperformAfterSave}
                        isPerforming={isPerforming}
                        hideButtons
                    />
                )}
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
