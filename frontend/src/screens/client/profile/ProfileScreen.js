import { useRef, useState } from "react";

import { images } from "../../../assets/images/images";
import { customersApi } from "../../../api/customersApi";
import useAutoHttpRequest from "../../../hooks/useAutoHttpRequest";
import useHttpRequest from "../../../hooks/useHttpRequest";

import SimpleLoader from "../../../components/simpleComponents/SimpleLoader";
import SimpleScreen from "../../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../../components/simpleComponents/SimpleScrollView";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleCard from "../../../components/simpleComponents/SimpleCard";
import SimpleInput from "../../../components/simpleComponents/SimpleInput";
import SimpleImage from "../../../components/simpleComponents/SimpleImage";
import SimpleButton from "../../../components/simpleComponents/SimpleButton";

import PrimaryButton from "../../../components/styledComponents/buttons/PrimaryButton";
import Separator from "../../../components/styledComponents/separators/Separator";

import TopToolBarSmallScreen from "../../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import { getClientNavBarData } from "../../../components/navBars/data/ClientNavBarData";

import { ClientStackName } from "../../../navigation/ClientStack";
import { ClientMainScreenName } from "../clientMainScreen/ClientMainScreen";
import { useScreenSize } from "../../../providers/ScreenSizeProvider";
import { usePopup } from "../../../providers/PopUpProvider";
import { Text12, Text14, TextBold16, TextBold24 } from "../../../components/specializedComponents/text/AllTextKindFile";

import { formatDateForInput } from "../../../functions/date/formatDateForInput";
import { uploadFileToR2, getFileReadUrl } from "../../../utils/fileUploadUtils";

import "./ProfileScreen.scss";

export const ProfileScreenName = "/ProfileScreen";

export default function ProfileScreen() {
    const { isSmallScreen } = useScreenSize();
    const { openPopup, closePopup } = usePopup();

    const fileInputRef = useRef(null);


    const [profile, setProfile] = useState({
        photoUri: null,
        photoKey: null,
        name: "",
        email: "",
        companyName: "",
        phoneNumber: "",
        dateOfBirth: "",
    });

    const initialFetchDoneRef = useRef(false);

    const onSuccessSave = (data) => {
        if (data?.ProfilePicReadUrl) {
            setProfile((p) => ({ ...p, photoUri: data.ProfilePicReadUrl }));
        }

        openPopup(
            <SimpleContainer className="lw-profileScreen__successPopup">
                <TextBold16>הצלחה</TextBold16>
                <Separator className="lw-profileScreen__popupSep" />
                <Text14>פרופיל התעדכן בהצלחה</Text14>
                <Separator className="lw-profileScreen__popupSep" />
                <PrimaryButton className="lw-profileScreen__popupOk" onPress={() => closePopup()}>
                    אישור
                </PrimaryButton>
            </SimpleContainer>
        );
    };

    const { isPerforming: isSaving, performRequest: performSave } = useHttpRequest(
        customersApi.updateCurrentCustomer,
        onSuccessSave,
        null
    );

    const { isPerforming: isFetching } = useAutoHttpRequest(customersApi.getCurrentCustomer, {
        onSuccess: async (data) => {
            initialFetchDoneRef.current = true;
            setProfile((p) => ({
                ...p,
                name: data?.Name ?? "",
                email: data?.Email ?? "",
                companyName: data?.CompanyName ?? "",
                phoneNumber: data?.PhoneNumber ?? "",
                dateOfBirth: data?.DateOfBirth ? formatDateForInput(data.DateOfBirth) : "",
                photoKey: data?.PhotoKey || (data?.ProfilePicUrl?.startsWith("users/") ? data.ProfilePicUrl : null),
                photoUri: data?.ProfilePicReadUrl || null,
            }));
        },
        onFailure: (error) => {
            console.error("Error fetching current customer:", error);
        },
    });

    const handleChooseImage = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e) => {
        try {
            const file = e?.target?.files?.[0] || null;
            if (!file) return;

            const uploadRes = await uploadFileToR2(file);
            const key = uploadRes?.data?.key || uploadRes?.key;
            if (!uploadRes?.success || !key) {
                throw new Error(uploadRes?.message || "Upload failed");
            }

            const readRes = await getFileReadUrl(key);
            const readUrl = readRes?.data?.readUrl || null;

            setProfile((p) => ({ ...p, photoKey: key, photoUri: readUrl }));
        } catch (err) {
            console.error("Failed to upload profile image", err);
            openPopup(
                <SimpleContainer className="lw-profileScreen__errorPopup">
                    <TextBold16>אופס...</TextBold16>
                    <Separator className="lw-profileScreen__popupSep" />
                    <Text14>{String(err?.message ?? err)}</Text14>
                    <Separator className="lw-profileScreen__popupSep" />
                    <PrimaryButton className="lw-profileScreen__popupOk" onPress={() => closePopup()}>
                        אישור
                    </PrimaryButton>
                </SimpleContainer>
            );
        } finally {
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    const handleSave = () => {
        const payload = {
            Name: profile.name,
            Email: profile.email,
            PhoneNumber: profile.phoneNumber,
            CompanyName: profile.companyName,
            dateOfBirth: profile.dateOfBirth || null,
            PhotoKey: profile.photoKey,
        };

        performSave(payload);
    };

    if (isFetching) return <SimpleLoader />;

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && (
                <TopToolBarSmallScreen
                    LogoNavigate={ClientStackName + ClientMainScreenName}
                    GetNavBarData={getClientNavBarData}
                    chosenIndex={2}
                />
            )}

            <SimpleScrollView className="lw-profileScreen__scroll">
                <SimpleContainer className="lw-profileScreen">
                    <SimpleContainer className="lw-profileScreen__header">
                        <SimpleContainer className="lw-profileScreen__avatarWrap">
                            <SimpleImage
                                className="lw-profileScreen__avatar"
                                resizeMode="cover"
                                src={profile.photoUri || images.Logos.LogoSlangWhite}
                            />

                            <SimpleButton
                                className="lw-profileScreen__avatarEdit"
                                onPress={handleChooseImage}
                                disabled={isSaving}
                            >
                                <Text12 className="lw-profileScreen__avatarEditText">ערוך</Text12>
                            </SimpleButton>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="lw-profileScreen__fileInput"
                                onChange={handleFileChange}
                            />
                        </SimpleContainer>

                        <TextBold24 className="lw-profileScreen__name">{profile.name || ""}</TextBold24>
                    </SimpleContainer>

                    <SimpleContainer className="lw-profileScreen__content">
                        <SimpleCard className="lw-profileScreen__card">

                            <SimpleContainer className="lw-profileScreen__form">
                                <SimpleInput
                                    className="lw-profileScreen__input"
                                    title="שם לקוח"
                                    value={profile.name}
                                    onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                                />

                                <SimpleInput
                                    className="lw-profileScreen__input"
                                    title="מייל"
                                    type="email"
                                    value={profile.email}
                                    onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                                />

                                <SimpleInput
                                    className="lw-profileScreen__input"
                                    title="מספר פלאפון"
                                    type="tel"
                                    value={profile.phoneNumber}
                                    onChange={(e) => setProfile((p) => ({ ...p, phoneNumber: e.target.value }))}
                                />

                                <SimpleInput
                                    className="lw-profileScreen__input"
                                    title="שם חברה"
                                    value={profile.companyName}
                                    onChange={(e) => setProfile((p) => ({ ...p, companyName: e.target.value }))}
                                />

                                <SimpleInput
                                    className="lw-profileScreen__input"
                                    title="תאריך לידה"
                                    type="date"
                                    value={profile.dateOfBirth || ""}
                                    onChange={(e) => setProfile((p) => ({ ...p, dateOfBirth: e.target.value }))}
                                />

                                <PrimaryButton
                                    className="lw-profileScreen__saveButton"
                                    onPress={handleSave}
                                    disabled={isSaving}
                                >
                                    {isSaving ? "שומר..." : "שמור"}
                                </PrimaryButton>
                            </SimpleContainer>
                        </SimpleCard>
                    </SimpleContainer>
                </SimpleContainer>
            </SimpleScrollView>
        </SimpleScreen>
    );
}
