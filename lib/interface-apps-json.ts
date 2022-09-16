export default interface AppsJsonSchema {
    name:   string;
    apps:   Apps;
    config: Config;
}

export interface Apps {
    [key: string]: App;
}

export interface App {
    id:       number;
    name:     string;
    is_host:  boolean;
    class:    string;
    releases: Releases;
}

export interface Releases {
    [key: string]: Release;
}

export interface Release {
    id:       number;
    services: { [key: string]: Service };
    volumes:  { [key: string]: object };
}

export interface Service {
    id:          number;
    image_id:    number;
    image:       string;
}

export interface Config {
    RESIN_SUPERVISOR_DELTA_VERSION:         string;
    RESIN_SUPERVISOR_NATIVE_LOGGER:         string;
    RESIN_HOST_CONFIG_avoid_warnings:       string;
    RESIN_HOST_CONFIG_disable_splash:       string;
    RESIN_HOST_CONFIG_dtoverlay:            string;
    RESIN_HOST_CONFIG_dtparam:              string;
    RESIN_HOST_CONFIG_gpu_mem:              string;
    RESIN_HOST_FIREWALL_MODE:               string;
    RESIN_SUPERVISOR_DELTA:                 string;
    RESIN_SUPERVISOR_LOCAL_MODE:            string;
    RESIN_SUPERVISOR_POLL_INTERVAL:         string;
    RESIN_SUPERVISOR_DELTA_REQUEST_TIMEOUT: string;
}
