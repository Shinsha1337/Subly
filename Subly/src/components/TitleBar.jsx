import { Close, Minimize, Maximize, Restore } from './Icons';
import SettingsDropdown from './SettingsDropdown';
import TimelineBadge from './TimelineBadge';

export default function TitleBar({ status, timelineName, maximized, onOpenSettings, theme, onThemeChange }) {
    const platform = window.windowAPI.platform;
    const isMac = platform === 'darwin';
    // Windows draws NATIVE caption buttons over the titlebar (titleBarOverlay in
    // main.js) — rendering our own would double them. Other non-mac platforms
    // keep the custom buttons so the dev app stays drivable.
    const nativeControls = platform === 'win32';

    return (
        <header className={'titlebar' + (isMac ? ' macos' : '') + (nativeControls ? ' wco' : '')}>
            <div className="tb-left">
                {!isMac && <SettingsDropdown onOpenSettings={onOpenSettings} theme={theme} onThemeChange={onThemeChange} />}
            </div>
            <div className="tb-center">
                {/* Always rendered. Hiding the badge when the connection drops
                    removed the one indicator the user needs at exactly the
                    moment it matters. */}
                <TimelineBadge status={status} timelineName={timelineName} />
            </div>
            <div className="tb-right">
                {isMac && (
                    <SettingsDropdown onOpenSettings={onOpenSettings} theme={theme} onThemeChange={onThemeChange} />
                )}
                {!isMac && !nativeControls && (
                    <>
                        <button className="icon-btn win-btn min" aria-label="Minimize" onClick={() => window.windowAPI.minimize()}><Minimize /></button>
                        <button
                            className="icon-btn win-btn max"
                            aria-label={maximized ? 'Restore down' : 'Maximize'}
                            data-tip={maximized ? 'Restore down' : 'Maximize'}
                            onClick={() => window.windowAPI.toggleMaximize()}
                        >
                            {maximized ? <Restore /> : <Maximize />}
                        </button>
                        <button className="icon-btn win-btn close" aria-label="Close Subly" onClick={() => window.windowAPI.close()}><Close /></button>
                    </>
                )}
            </div>
        </header>
    );
}
