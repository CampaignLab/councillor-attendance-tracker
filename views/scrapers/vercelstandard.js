import { collectReformAttendanceData } from './standard.js';
import { put } from '@vercel/blob';
import path from 'path';

const updateVercelReformAttendanceData = async () => {
    const councilsJsonPath = path.resolve('./councils.json');
    const jsonCouncils = await fs.readFile(councilsJsonPath);
    const councils = JSON.parse(jsonCouncils);

    for (let { fileName, councilName, baseUrl } of councils) {
        try {
            console.log(`Gathering data for: ${councilName}`);
            const data = await collectReformAttendanceData(
                councilName,
                baseUrl
            );
            // this object will eventually contain a list of councillor objects from all parties - for now everyone will be a reform councillor
            const obj = { councilName, attendanceData: data };
            const jsonStr = JSON.stringify(obj);
            const res = await put(`${fileName}Data.json`, jsonStr, {
                access: 'public',
                allowOverwrite: true,
            }); //probably dont need the output
        } catch (err) {
            console.log(`${councilName} didnt work`);
            console.error(err);
        }
    }
    return { success: true };
};

export default updateVercelReformAttendanceData;
