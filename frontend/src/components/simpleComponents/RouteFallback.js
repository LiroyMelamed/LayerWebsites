import SimpleContainer from "./SimpleContainer";

import "./RouteFallback.scss";

export default function RouteFallback() {
    return (
        <SimpleContainer className="lw-routeFallback" role="status" aria-live="polite" aria-busy="true">
            <SimpleContainer className="lw-routeFallback__spinner" />
        </SimpleContainer>
    );
}
