import SimpleContainer from "../../../simpleComponents/SimpleContainer";
import CaseTypeTimeline from "../../cases/CaseTypeTimeline";

export default function CaseTypeMenuItemOpen({ caseType, isOpen, editCaseType }) {
    return (
        <SimpleContainer
            style={{
                ...styles.openDataContainer,
                maxHeight: isOpen ? '700px' : '0', // Adjust maxHeight dynamically
                opacity: isOpen ? 1 : 0, // Fade effect
            }}
        >
            <CaseTypeTimeline stages={caseType?.Descriptions || []} title={'פירוט שלבים'} />
        </SimpleContainer>
    )
}

const styles = {
    openDataContainer: {
        overflow: 'hidden', // Hide content when not open
        transition: 'max-height 0.5s ease, opacity 0.5s ease', // Smooth transition for both maxHeight and opacity
        maxHeight: '0', // Start with 0 height
        opacity: 0, // Start with 0 opacity
        marginTop: 8,
        marginRight: 28,
    },
};