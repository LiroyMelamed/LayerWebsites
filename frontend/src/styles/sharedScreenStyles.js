// Load the styles that are shared across lazy screen chunks once, in a
// deterministic order: components first, then their screen overrides. Their
// selectors and declarations remain unchanged; screen/component imports still
// resolve to these same modules. This avoids contradictory CSS chunk order.
import "../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen.scss";
import "../components/simpleComponents/Skeleton.scss";
import "../components/specializedComponents/charts/DoughnutChart.scss";
import "../components/specializedComponents/containers/ProgressBar.scss";
import "../components/specializedComponents/signFiles/LawyerStampPopup.scss";
import "../components/specializedComponents/signFiles/fieldToolbar/addFieldPanel.scss";
import "../components/specializedComponents/signFiles/fieldToolbar/fieldContextMenu.scss";
import "../components/specializedComponents/signFiles/fieldToolbar/fieldToolbar.scss";
import "../components/specializedComponents/text/ListPageTitle.scss";
import "../components/styledComponents/SegmentedSwitch.scss";
import "../components/styledComponents/buttons/ChooseButton.scss";
import "../components/styledComponents/cases/CaseTimeline.scss";
import "../components/styledComponents/cases/StageFileUpload.scss";
import "../components/styledComponents/defaultState/DefaultState.scss";
import "../components/styledComponents/fileUpload/FileUploadBox.scss";
import "../components/styledComponents/menuItems/CaseMenuItem.scss";
import "../components/styledComponents/menuItems/components/CaseMenuItemOpen.scss";
import "../components/styledComponents/menuItems/components/LicenseExpiryUpdateModal.scss";
import "../screens/allCasesScreen/AllCasesScreen.scss";
import "../screens/allCasesScreen/components/AllCasesCard.scss";
import "../screens/calendarScreen/CalendarInviteScreen.scss";
import "../screens/calendarScreen/components/CalendarSmsTemplateEditor.scss";
import "../screens/calendarScreen/components/EventFormModal.scss";
import "../screens/client/clientCasesScreen/ClientCasesScreen.scss";
import "../screens/client/clientMainScreen/ClientMainScreen.scss";
import "../screens/client/clientMainScreen/components/ClosedCasesCard.scss";
import "../screens/client/clientMainScreen/components/OpenCasesCard.scss";
import "../screens/mainScreen/MainScreen.scss";
import "../screens/mainScreen/components/CalendarWidget.scss";
import "../screens/mainScreen/components/commandCenter/CommandCenter.scss";
import "../screens/remindersScreen/components/ReminderDetailPopup.scss";
import "../screens/signingScreen/SigningManagerScreen.scss";
import "../screens/signingScreen/UploadFileForSigningScreen.scss";
