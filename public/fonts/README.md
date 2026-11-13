# Bundled fonts

## HarmonyOS Sans SC

The app's default sans-serif font is the unmodified `HarmonyOS_Sans_SC.ttf` variable font from Huawei's [official design resources](https://developer.huawei.com/consumer/cn/design/resource/), downloaded on 2026-11-14. Its weight axis covers 40–900; the app exposes weights 100–900.

Copyright 2021 Huawei Device Co., Ltd. The complete license is included in `HarmonyOS-Sans-LICENSE.txt`. The main app's Help page and the desktop lyrics settings footer acknowledge the font. Keep the font unmodified, including when packaging it; do not subset or convert it.

SHA-256: `8978e05044e7089ad6a9de38c505c8148305607983487435a916d2610700a7ca` (identical to the file in the official archive).

The original download is [HarmonyOS Sans](https://alliance-communityfile-drcn.dbankcdn.com/FileServer/getFile/cmtyManage/011/111/111/0000000000011111111.20260627152129.89276966309836366526585265125586:50001231000000:2800:A0161E048334FE0271F9F5ECBBD5070D17381C7846125F4D7109DBC7B532C715.zip?needInitFileName=true). Vite copies `public/fonts/` into both web and desktop output, so no system installation or external font service is required.
